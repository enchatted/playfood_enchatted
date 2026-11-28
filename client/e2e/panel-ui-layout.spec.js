import { test, expect } from '@playwright/test';
import { bootMission, pressEnter } from './helpers.js';
import { installIntroProbe, readIntroFrame } from './intro-card-probe.js';
import { LIGHTHOUSE_STATIONS } from '../src/overworld/lighthouseData.js';

// a touch device: the on-screen controls only show with a finger-type pointer
test.use({ hasTouch: true });

const langs = ['el', 'en', 'nl', 'pt'];
const sizes = [{ width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 844, height: 390 }];
const overlaps = (a, b) => Math.min(a.right,b.right) - Math.max(a.left,b.left) > .75
  && Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top) > .75;

// UI tests never write synthetic playthroughs into a teacher's local database.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { tracking: false } }));
  if (process.env.LAYOUT_NEGATIVE_CONTROL === 'market') {
    await page.route('**/src/games/engine/marketTripRenderer.js*', async route => {
      const response = await route.fetch(), body = await response.text();
      const needle = 'const placement = getMarketChoicePlacement(missionIntroViewport(ctx));';
      expect(body).toContain(needle);
      await route.fulfill({ response, body: body.replace(needle, 'const placement = null;') });
    });
  }
  if (process.env.LAYOUT_NEGATIVE_CONTROL === 'phygital') {
    await page.route('**/src/components/PhygitalModal.jsx*', async route => {
      const response = await route.fetch(), body = await response.text();
      const needle = 'margin: "0 auto 18px"';
      expect(body).toContain(needle);
      await route.fulfill({ response, body: body.replaceAll(needle, 'margin: "-8px auto 18px"')
        .replace('margin: "14px 0 12px"', 'marginTop: 14') });
    });
  }
});

for (const lang of langs) for (const size of sizes) {
  test(`market choice avoids every actual control ${lang} ${size.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await installIntroProbe(page);
    await bootMission(page, 'local', 2, lang);
    await pressEnter(page);
    await page.waitForFunction(() => !document.querySelector('canvas')._stateRef.current.showMissionIntro);
    // Positioning is a test shortcut; opening/choosing/buying is real input.
    await page.evaluate(() => {
      // The month follows the real date, so pick a stall whose local card can be bought today.
      const s=document.querySelector('canvas')._stateRef.current, p=s.player, a=s.stalls.find(st=>st.local.available!==false).approach;
      Object.assign(p,{col:a.col,row:a.row,pixelX:a.col*32,pixelY:a.row*32,fromX:a.col*32,fromY:a.row*32,toX:a.col*32,toY:a.row*32,moving:false,moveTimer:0,dir:a.dir});
    });
    await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.actionPrompt);
    await pressEnter(page);
    await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.showingChoice);
    await page.waitForTimeout(350);
    const frame=await readIntroFrame(page);
    // On a landscape phone the compact card has its own close button.
    const compact=size.height<500;
    expect(frame.controls.map(c=>c.key).sort()).toEqual(compact ? [] : ['ArrowDown','ArrowLeft','ArrowRight','ArrowUp','Enter','q'].sort());
    expect(await page.evaluate(()=>document.querySelector('canvas')._stateRef.current.choiceCompact)).toBe(compact);
    const panels=frame.shapes.filter(s=>s.fill==='#fff8e1' && s.right-s.left>180 && s.bottom-s.top>100);
    expect(panels,'the actual choice-panel fill must be uniquely drawn').toHaveLength(1);
    const panel=panels[0];
    expect(panel.left).toBeGreaterThanOrEqual(0);expect(panel.top).toBeGreaterThanOrEqual(0);
    expect(panel.right).toBeLessThanOrEqual(size.width);expect(panel.bottom).toBeLessThanOrEqual(size.height);
    for(const control of frame.controls) expect(overlaps(panel,control),`choice panel vs ${control.key}`).toBe(false);
    // Every drawn paragraph/label inside the panel's draw order remains visible.
    for(const text of frame.texts.filter(t=>t.order>panel.order)) {
      expect(text.left,`${text.text} left`).toBeGreaterThanOrEqual(panel.left-.75);
      expect(text.right,`${text.text} right`).toBeLessThanOrEqual(panel.right+.75);
      expect(text.top,`${text.text} top`).toBeGreaterThanOrEqual(panel.top-.75);
      expect(text.bottom,`${text.text} bottom`).toBeLessThanOrEqual(panel.bottom+.75);
      for(const control of frame.controls) expect(overlaps(text,control),`${text.text} vs ${control.key}`).toBe(false);
    }
    await testInfo.attach('choice-screen', { body: await page.screenshot(), contentType: 'image/png' });
    await testInfo.attach('choice-frame', { body: Buffer.from(JSON.stringify(frame)), contentType: 'application/json' });
    // Click the actual drawn local card, then verify the purchase: hit testing
    // must follow the transformed panel too, rather than only its appearance.
    const cards=frame.shapes.filter(s=>s.order>panel.order && s.bottom-s.top>80 && s.right-s.left>70 && (s.stroke==='#6b8e4e' || s.stroke==='#5c78a6'));
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const local=cards[0];await page.mouse.click((local.left+local.right)/2,(local.top+local.bottom)/2);
    await page.waitForFunction(() => document.querySelector('canvas')._stateRef.current.stallsDone===1);
  });
}

for(const lang of langs) for(const size of [sizes[0],sizes[2]]) {
  test(`phygital success description has its own space ${lang} ${size.width}`,async({page},testInfo)=>{
    await page.setViewportSize(size);
    await page.route('**/api/phygital/redeem',route=>route.fulfill({json:{success:true,id:'UI_TEST',points:50,description:'Μια δραστηριότητα στην τάξη — A classroom activity — Uma atividade na sala de aula.'}}));
    await page.goto(`/?testMode=1&lang=${lang}`);
    await page.waitForFunction(()=>window.__playfood);
    await page.evaluate(()=>{const s=window.__playfood.state();s.setHero('braid');s.markLighthouseOnboardingSeen();window.__playfood.goToScreen('lighthouse');});
    await page.waitForFunction(()=>window.__playfood.screen()==='lighthouse');
    await page.waitForFunction(()=>document.querySelector('canvas')?._stateRef?.current?.irisOpenness>=1);
    await page.evaluate(({col,row})=>{
      const p=document.querySelector('canvas')._stateRef.current.player;
      Object.assign(p,{col,row:row+1,pixelX:col*32,pixelY:(row+1)*32,fromX:col*32,fromY:(row+1)*32,toX:col*32,toY:(row+1)*32,moving:false,moveTimer:0,dir:1});
    },LIGHTHOUSE_STATIONS.qr);
    await page.waitForFunction(()=>document.querySelector('canvas')._stateRef.current.nearQR);
    await pressEnter(page);
    const dialog=page.getByRole('dialog'),input=dialog.getByRole('textbox');
    await expect(input).toBeFocused();await expect(input).toHaveAttribute('aria-label',/.+/);
    await page.keyboard.press('Shift+Tab');await expect(dialog.locator('button').last()).toBeFocused();
    await page.keyboard.press('Tab');await expect(input).toBeFocused();
    const outline=await input.evaluate(e=>getComputedStyle(e).outlineStyle);expect(outline).not.toBe('none');
    await input.fill('UI-TEST');await dialog.locator('button[type=submit]').click();
    const status=dialog.getByRole('status');await expect(status).toContainText('50');
    const description=dialog.getByText(/Μια δραστηριότητα στην τάξη/);
    await expect(description).toBeVisible();
    const a=await status.boundingBox(),b=await description.boundingBox();
    expect(b.y-a.y-a.height,'separate success and activity-description paragraphs').toBeGreaterThanOrEqual(10);
    const contrast=await dialog.locator('button').first().evaluate(e=>({bg:getComputedStyle(e).backgroundColor,fg:getComputedStyle(e).color}));
    expect(contrast.bg).toBe('rgb(51, 105, 30)');
    await testInfo.attach('phygital-success', { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(page.locator('canvas')).toBeFocused();
  });
}
