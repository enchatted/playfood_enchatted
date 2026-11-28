import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { bootMission, pressEnter } from './helpers.js';
import { INTRO_MISSIONS, introFixture } from './intro-card-fixtures.js';
import { installIntroProbe, readIntroFrame, expectIntroFrame } from './intro-card-probe.js';
import { getTouchControlCapabilities } from '../src/utils/touchControls.js';

// a touch device: the on-screen controls only show with a finger-type pointer
test.use({ hasTouch: true });

const languages=(process.env.INTRO_LANGS||'el,en,nl,pt').split(',');
const sizes=(process.env.INTRO_SIZES||'844x390,1024x768,1366x768').split(',').map(size=>{const[width,height]=size.split('x').map(Number);return{width,height};});
const dprs=(process.env.INTRO_DPRS||'1,2').split(',').map(Number);
const introCapabilities=mission=>mission[3]==='SpotTheFake'
  ? {movement:false,action:false,drop:false,back:false,start:true}
  : getTouchControlCapabilities('game',mission[3]);

async function expectIntroControls(page,mission,language){
  if(mission[3]!=='SpotTheFake'){
    await expect(page.locator('[data-testid="touch-controls-surface"]')).toBeVisible();
    return;
  }
  const locale=JSON.parse(fs.readFileSync(new URL(`../src/i18n/locales/${language}.json`,import.meta.url)));
  if(process.env.INTRO_HIDE_SPOT_START==='1')await page.addStyleTag({content:'.spot-intro-start{display:none!important}'});
  const start=page.getByRole('button',{name:locale.spotthefake.teaching_start,exact:true});
  await expect(start).toBeVisible();
  await expect(page.locator('.spot-intro-start')).toHaveCount(1);
  await expect(page.locator('[data-testid="touch-controls-surface"]')).toHaveCount(0);
  const button=await start.boundingBox(),canvas=await page.locator('canvas').boundingBox();
  expect(button.x).toBeGreaterThanOrEqual(Math.max(0,canvas.x));
  expect(button.y).toBeGreaterThanOrEqual(Math.max(0,canvas.y));
  expect(button.x+button.width).toBeLessThanOrEqual(canvas.x+canvas.width);
  expect(button.y+button.height).toBeLessThanOrEqual(canvas.y+canvas.height);
}

for(const dpr of dprs)for(const size of sizes)for(const language of languages)for(const mission of INTRO_MISSIONS){
  test(`intro fit ${mission[3]} ${language} ${size.width}x${size.height} DPR${dpr}`,async({browser})=>{
    const context=await browser.newContext({viewport:size,deviceScaleFactor:dpr,hasTouch:true});
    const page=await context.newPage();
    try{
      await installIntroProbe(page);
      await bootMission(page,mission[0],mission[1],language);
      await page.waitForFunction(()=>document.querySelector('canvas')._stateRef.current.showMissionIntro);
      await expectIntroControls(page,mission,language);
      expectIntroFrame(await readIntroFrame(page),introFixture(mission,language),introCapabilities(mission));
      if(mission[3]==='MarketTrip'&&size.height<500){
        await expect(page.getByTestId('market-trip-receipt')).not.toBeVisible();
        await pressEnter(page);
        await expect(page.getByTestId('market-trip-receipt')).toBeVisible();
      }
    }finally{await context.close();}
  });
}

// Some games ignore Enter for a short minimum time (GardenPlanner 0.5s), so press until the card is gone;
// otherwise "Guide" lands on the still-open first card and it is not a reopen.
async function dismissIntro(page){
  await expect(async()=>{
    await pressEnter(page);
    expect(await page.evaluate(()=>document.querySelector('canvas')._stateRef.current.showMissionIntro)).toBe(false);
  }).toPass();
}

for(const mission of INTRO_MISSIONS){
  test(`intro reopens and live resize ${mission[3]}`,async({page})=>{
    await page.setViewportSize({width:1366,height:768});
    await installIntroProbe(page);
    await bootMission(page,mission[0],mission[1],'el');
    const intro=introFixture(mission,'el'),reopened=introFixture(mission,'el',{reopened:true}),caps=introCapabilities(mission);
    await expectIntroControls(page,mission,'el');
    expectIntroFrame(await readIntroFrame(page),intro,caps);
    await dismissIntro(page);
    await page.getByRole('button',{name:/Πώς παίζω/}).click();
    await page.waitForFunction(()=>document.querySelector('canvas')._stateRef.current.showMissionIntro);
    for(const viewport of [{width:844,height:390},{width:1024,height:768},{width:1366,height:768}]){
      await page.setViewportSize(viewport);
      expectIntroFrame(await readIntroFrame(page),reopened,caps);
    }
    await dismissIntro(page);
    await page.getByRole('button',{name:/Παύση/}).click();
    await expect(page.getByRole('dialog',{name:'Παύση'})).toBeVisible();
    await page.getByRole('dialog',{name:'Παύση'}).getByRole('button',{name:/Πώς παίζω/}).click();
    await expect(page.getByRole('dialog',{name:'Παύση'})).toHaveCount(0);
    expectIntroFrame(await readIntroFrame(page),reopened,caps);
  });
}
