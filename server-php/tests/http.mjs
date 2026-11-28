import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from '../../client/node_modules/playwright/index.mjs';
const temp=mkdtempSync(join(tmpdir(),'playfood-upload-test-'));
const result=JSON.parse(execFileSync(process.execPath,['server-php/build-package.mjs',temp],{encoding:'utf8'}));
const port=await new Promise(resolvePort=>{ const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolvePort(p));});});
const base=`http://127.0.0.1:${port}`;
// The built-in server has no TLS; this test-only prepend marks a request as HTTPS when it carries the header.
const httpsShim=join(temp,'https-shim.php');
writeFileSync(httpsShim,"<?php if (($_SERVER['HTTP_X_TEST_HTTPS'] ?? '') === '1') $_SERVER['HTTPS'] = 'on';\n");
const https={'X-Test-HTTPS':'1'};
const server=spawn('php',['-d','expose_php=1','-d',`auto_prepend_file=${httpsShim}`,'-S',`127.0.0.1:${port}`,'-t',result.upload],{stdio:['ignore','pipe','pipe']});
let log='';server.stderr.on('data',data=>{log+=data;});
server.stdout.resume();
let headerChecks=0;
function assertNoPhpVersion(response,label) {
  assert.equal(response.headers.get('x-powered-by'),null,`${label} must not expose the PHP version`);
  headerChecks++;
  return response;
}
const api=async(route,options={})=>assertNoPhpVersion(await fetch(`${base}/api/index.php?route=${route}`,options),`API ${route}`);
const post=(body,token)=>({method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
try {
  let setupPage;
  for(let i=0;i<60;i++){try{setupPage=await fetch(`${base}/setup.php`);break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(setupPage,'The isolated PHP server started');
  assert.equal(assertNoPhpVersion(setupPage,'Setup HTML').status,200);
  assert.match(await setupPage.text(),/Use the HTTPS address/);
  assert.equal(readdirSync(join(temp,'PLAYFOOD_Upload')).some(n=>n.startsWith('playfood-private-')),false,'plain HTTP creates no key');
  const firstVisit=assertNoPhpVersion(await fetch(`${base}/setup.php`,{headers:https}),'First HTTPS setup visit');
  const privateName=readdirSync(join(temp,'PLAYFOOD_Upload')).find(n=>n.startsWith('playfood-private-'));
  assert.ok(privateName,'the first visit creates private storage');
  assert.ok((await firstVisit.text()).includes(privateName),'setup names the private folder');
  const privateDir=join(temp,'PLAYFOOD_Upload',privateName);
  const keyFile=join(privateDir,'installation-key.txt');
  const key=readFileSync(keyFile,'utf8').trim();
  assert.match(key,/^[a-f0-9]{48}$/);
  await fetch(`${base}/setup.php`,{headers:https});
  assert.equal(readFileSync(keyFile,'utf8').trim(),key,'a repeat visit keeps the same key');
  assert.equal((await api('stats')).status,503);
  const form={key,email:'teacher@example.org',password:'A-test-password-2026!',timezone:'Europe/Athens',tracking:'on'};
  const bad=assertNoPhpVersion(await fetch(`${base}/setup.php`,{method:'POST',headers:https,body:new URLSearchParams({...form,key:'wrong'})}),'Rejected setup');
  assert.match(await bad.text(),/Incorrect installation key/);
  assert.equal((await api('health')).status,503);
  const setup=assertNoPhpVersion(await fetch(`${base}/setup.php`,{method:'POST',headers:https,body:new URLSearchParams(form)}),'Completed setup');
  assert.match(await setup.text(),/Installation complete/);
  assert.equal(existsSync(keyFile),false,'setup consumes the key');
  const issued=JSON.parse(readFileSync(join(privateDir,'phygital-codes.json'),'utf8'));
  const shipped=JSON.parse(readFileSync(join(result.upload,'api/lib/default-codes.json'),'utf8'));
  assert.equal(issued.length,shipped.length);
  assert.ok(shipped.every(a=>!('code' in a)),'the package ships no codes');
  for(const a of issued) assert.match(a.code,/^[0-9A-F]{8}$/);
  assert.equal(new Set(issued.map(a=>a.code)).size,issued.length);
  const firstCode=issued[0].code, firstId=issued[0].id;
  const health=await api('health');assert.equal(health.status,200);assert.equal((await health.json()).db,true);
  const config=await api('config');assert.equal(config.status,200);assert.equal((await config.json()).tracking,true);
  assert.equal((await api('stats')).status,401);
  const login=await api('login',post({email:form.email,password:form.password}));
  assert.equal(login.status,200);
  const {token}=await login.json();assert.equal(token.length,48);
  const auth={headers:{Authorization:`Bearer ${token}`}};
  assert.equal((await api('session',auth)).status,200);
  assert.equal((await api('login',post({email:form.email,password:'wrong'}))).status,401);
  const empty=await (await api('stats',auth)).json();
  assert.equal(empty.overview.sessions,0); assert.equal(empty.perIsland.length,4);
  const common={learner_id:'learner01',session_id:'session01',language:'el',secret:''};
  const events=[{type:'session_start',returning:false},
    {type:'game_start',island:'growing',game:'WhereDoesItGrow',attempt_id:'attempt01'},
    {type:'game_finish',island:'growing',game:'WhereDoesItGrow',attempt_id:'attempt01',passed:true,score:50,stars:2,duration_s:60}];
  for(const e of events) assert.equal((await api('ev',post({...common,...e}))).status,204);
  assert.equal((await api('ev',post({...common,...events[2]}))).status,204);
  const stats=await (await api('stats&language=el',auth)).json();
  assert.equal(stats.overview.gamesFinished,1);
  assert.equal(stats.perIsland[0].games[0].matchedFinished,1);
  assert.equal((await (await api('stats&language=nl',auth)).json()).overview.gamesFinished,0);
  assert.equal((await api('stats&from=2026-02-31',auth)).status,400);
  const csvRes=await api('export.csv',auth);const csv=await csvRes.text();assert.equal(csv.trim().split('\n').length,5);
  assert.equal(csv.split('\n')[0].trim(),'sep=,');assert.match(csv.split('\n')[1],/,local_time,timestamp_utc,row_scope$/);
  assert.match(csvRes.headers.get('content-disposition'),/playfood-stats_all-time\.csv/);
  const backup=await api('backup',auth);assert.equal(backup.status,200);
  assert.equal(Buffer.from(await backup.arrayBuffer()).subarray(0,15).toString(),'SQLite format 3');
  assert.notEqual((await api('phygital/redeem',post({code:firstId,redeemedIds:[]}))).status,200,'the activity id is not a code');
  const reward=await (await api('phygital/redeem',post({code:firstCode.toLowerCase(),redeemedIds:[],language:'el'}))).json();
  assert.equal(reward.success,true);assert.equal(reward.points,shipped[0].points);
  assert.equal((await api('phygital/redeem',post({code:firstCode,redeemedIds:[firstId]}))).status,409);
  assert.equal((await api('phygital/redeem',post({code:firstCode,redeemedIds:{}}))).status,400);
  assert.equal((await api('phygital/redeem',post({code:firstCode,redeemedIds:[]}))).status,200);
  const privateResponse=await fetch(`${base}/${privateName}/installation.json`);
  const privateBody=await privateResponse.text();
  // PHP 8.4's built-in server may fall back to the game for missing paths.
  // A 200 is safe only when it is exactly that public page, never private JSON.
  assert.ok([200,404].includes(privateResponse.status));
  if(privateResponse.status===200) {
    assert.match(privateResponse.headers.get('content-type')||'',/text\/html/i);
    assert.equal(privateBody,readFileSync(join(result.upload,'index.html'),'utf8'));
  }
  const privateSettings=JSON.parse(readFileSync(join(privateDir,'installation.json'),'utf8'));
  assert.equal(typeof privateSettings.password_hash,'string');
  assert.ok(!privateBody.includes(privateSettings.password_hash));
  assert.doesNotMatch(privateBody,/"password_hash"\s*:|"retention_months"\s*:/);
  const codesFile=join(privateDir,'phygital-codes.json');
  const codes=JSON.parse(readFileSync(codesFile));codes[0].points=75;writeFileSync(codesFile,JSON.stringify(codes));
  assert.equal((await (await api('phygital/redeem',post({code:firstCode}))).json()).points,75);
  writeFileSync(codesFile,'invalid JSON');
  assert.equal((await (await api('phygital/redeem',post({code:firstCode}))).json()).points,75);
  writeFileSync(codesFile,JSON.stringify(codes));
  // Re-upload public files; setup and the private directory must survive unchanged.
  cpSync(resolve('server-php/public'),result.upload,{recursive:true});
  assert.match(await assertNoPhpVersion(await fetch(`${base}/setup.php`,{headers:https}),'Existing installation setup').text(),/Already installed/);
  assert.equal((await (await api('stats',auth)).json()).overview.gamesFinished,1);
  assert.equal((await api('logout',{method:'POST',headers:auth.headers})).status,200);
  assert.equal((await api('session',auth)).status,401);
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1366,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/panel/`);
    await page.locator('#email').fill(form.email);
    await page.locator('#password').fill(form.password);
    await page.locator('#signin').click();
    await page.locator('#dashboard').waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('#cFinished')?.textContent==='1');
    assert.equal(await page.locator('#cFinished').innerText(),'1');
    await page.reload();
    await page.locator('#dashboard').waitFor({state:'visible'});
    await page.screenshot({path:join(temp,'panel-verified.png'),fullPage:true});
    await page.locator('#signout').click();
    await page.locator('#login').waitFor({state:'visible'});
    await page.goto(base);
    assert.equal(await page.evaluate(async()=> (await fetch('/api/config')).json()).then(x=>x.tracking),true);
    assert.equal(await page.evaluate(async code=> (await fetch('/api/phygital/redeem',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})})).json(),firstCode).then(x=>x.success),true);
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
  const cfgFile=join(privateDir,'installation.json');const cfg=JSON.parse(readFileSync(cfgFile));cfg.enabled=false;writeFileSync(cfgFile,JSON.stringify(cfg));
  assert.equal((await api('login',post({email:form.email,password:form.password}))).status,503);
  assert.equal((await (await api('config')).json()).tracking,false);
  assert.equal((await api('phygital/redeem',post({code:firstCode}))).status,200);
  console.log('HTTP installation, authentication, events, CSV, backup, phygital, upgrade and disabled-panel checks passed.');
  console.log(`PHP version header checks passed: ${headerChecks} (expose_php=1).`);
  console.log(`Isolated test files: ${temp}`);
} catch(e) { console.error(log.slice(-3000)); throw e; }
finally { server.kill('SIGTERM'); }
