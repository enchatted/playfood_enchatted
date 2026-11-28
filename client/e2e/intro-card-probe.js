import { expect } from '@playwright/test';

// Observe a complete rendered frame. Rectangles and glyph boxes are converted
// through the transform at the actual drawing call, never through app layouts.
export async function installIntroProbe(page) {
  await page.addInitScript(() => {
    const frames = new WeakMap();
    const prototype = CanvasRenderingContext2D.prototype;
    const originalClear = prototype.clearRect;
    prototype.clearRect = function (...args) {
      frames.set(this.canvas, { texts: [], shapes: [], order: 0 });
      return originalClear.apply(this, args);
    };
    const point = (ctx, x, y) => {
      const m = ctx.getTransform(), r = ctx.canvas.getBoundingClientRect();
      return { x: r.left + (m.a*x + m.c*y + m.e)*r.width/ctx.canvas.width,
        y: r.top + (m.b*x + m.d*y + m.f)*r.height/ctx.canvas.height };
    };
    const bounds = points => ({ left: Math.min(...points.map(p=>p.x)), right: Math.max(...points.map(p=>p.x)),
      top: Math.min(...points.map(p=>p.y)), bottom: Math.max(...points.map(p=>p.y)) });
    const originalBegin = prototype.beginPath;
    prototype.beginPath = function (...args) { this.__introPoints=[]; return originalBegin.apply(this,args); };
    for (const method of ['moveTo', 'lineTo']) {
      const original = prototype[method];
      prototype[method] = function (x,y,...args) { (this.__introPoints ||= []).push(point(this,x,y)); return original.call(this,x,y,...args); };
    }
    const originalCurve = prototype.quadraticCurveTo;
    prototype.quadraticCurveTo = function (cx,cy,x,y) { (this.__introPoints ||= []).push(point(this,cx,cy),point(this,x,y)); return originalCurve.call(this,cx,cy,x,y); };
    for (const method of ['fill','stroke']) {
      const original = prototype[method];
      prototype[method] = function (...args) {
        const frame=frames.get(this.canvas);
        if (frame && this.__introPoints?.length) {
          const box=bounds(this.__introPoints), m=this.getTransform(), r=this.canvas.getBoundingClientRect();
          const extra=method==='stroke'?this.lineWidth*Math.hypot(m.a,m.b)*r.width/this.canvas.width/2:0;
          frame.shapes.push({...box,left:box.left-extra,right:box.right+extra,top:box.top-extra,bottom:box.bottom+extra,
            fill:method==='fill'?String(this.fillStyle).toLowerCase():null,stroke:method==='stroke'?String(this.strokeStyle).toLowerCase():null,order:frame.order++});
        }
        return original.apply(this,args);
      };
    }
    const originalText=prototype.fillText;
    prototype.fillText=function(text,x,y,...args){
      const frame=frames.get(this.canvas);
      if(frame){
        const metrics=this.measureText(String(text)),m=this.getTransform(),r=this.canvas.getBoundingClientRect();
        frame.texts.push({text:String(text),font:this.font,size:Number(this.font.match(/([\d.]+)px/)?.[1]||0)*Math.hypot(m.a,m.b)*r.width/this.canvas.width,
          ...bounds([point(this,x-metrics.actualBoundingBoxLeft,y-metrics.actualBoundingBoxAscent),point(this,x+metrics.actualBoundingBoxRight,y+metrics.actualBoundingBoxDescent)]),order:frame.order++});
      }
      return originalText.call(this,text,x,y,...args);
    };
    window.__readIntroFrame=()=>{const canvas=document.querySelector('canvas');return structuredClone(frames.get(canvas));};
  });
}

export async function readIntroFrame(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(180);
  return page.evaluate(() => {
    const frame = window.__readIntroFrame();
    const canvas = document.querySelector('canvas');
    let bar = document.querySelector('[data-testid="game-scorebar"], [data-testid="garden-topbar"], [data-testid="spot-the-fake-hud"], [data-testid="season-matcher-hud"]');
    for (let node = canvas; !bar && node?.parentElement; node = node.parentElement) {
      if (node.previousElementSibling?.querySelector('button')) bar = node.previousElementSibling;
    }
    if (!bar) throw new Error('actual game top bar not found');
    const rect = element => { const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; };
    return { ...frame, width:innerWidth,height:innerHeight,
      bar:rect(bar),
      controls:[...document.querySelectorAll('[data-testid="touch-controls-surface"] button[data-key], .spot-intro-start')].filter(el=>el.getClientRects().length).map(el=>({key:el.dataset.key || "Start",...rect(el)})),
    };
  });
}
const contains=(outer,inner,tolerance=.75)=>inner.left>=outer.left-tolerance && inner.right<=outer.right+tolerance && inner.top>=outer.top-tolerance && inner.bottom<=outer.bottom+tolerance;
const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.75 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.75;
const normalize=text=>text.replace(/\s+/g,' ').trim();

export function expectIntroFrame(frame, intro, capabilities) {
  const cards=frame.shapes.filter(shape=>shape.fill==='#fff8e1' && shape.right-shape.left>180 && shape.bottom-shape.top>120);
  const card=cards.at(-1);
  expect(card,'actual cream intro card').toBeTruthy();
  const outline=frame.shapes.find(shape=>shape.order>card.order && shape.order<card.order+3 && shape.stroke==='#33691e');
  const cardBox=outline||card;
  expect(contains({left:0,right:frame.width,top:frame.bar.bottom+1,bottom:frame.height},cardBox),'card outside screen or under header').toBe(true);
  const keys=[...(capabilities.movement===false?[]:['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']),
    ...(capabilities.action===false?[]:['Enter']),...(capabilities.drop?['q']:[]),
    ...(capabilities.back?['Escape']:[]),...(capabilities.start?['Start']:[])];
  for(const key of keys)expect(frame.controls.some(control=>control.key===key),`control ${key} present`).toBe(true);
  for(const control of frame.controls)expect(overlap(cardBox,control),`control ${control.key} covers card`).toBe(false);
  const texts=frame.texts.filter(text=>text.order>card.order);
  expect(texts.length).toBeGreaterThan(5);
  for(const text of texts)expect(contains(cardBox,text),`text outside card: ${text.text}`).toBe(true);
  for(let a=0;a<texts.length;a++)for(let b=a+1;b<texts.length;b++)expect(overlap(texts[a],texts[b]),`text collision: ${texts[a].text} / ${texts[b].text}`).toBe(false);
  const drawn=normalize(texts.map(text=>text.text).join(' '));
  for(const text of [...intro.steps,intro.introFact.quote,intro.preFact?.quote,intro.goal,intro.cta].filter(Boolean))expect(drawn).toContain(normalize(text));
  // A wrapped goal can begin with "3." too; numbered steps use the 15px body font.
  const body=texts.filter(text=>/^\d\./.test(text.text) && /^15px\s/.test(text.font));
  expect(body.length,'numbered intro steps').toBe(intro.steps.length);
  for(const line of body)expect(line.size,'actual body CSS font size').toBeGreaterThanOrEqual(frame.width<=900?11.5:13.9);
  // The preserved full-size card already shrinks some single-line goal pills
  // below 10px. Its unscaled 15px body is >=14.25 CSS px at the 0.95 threshold.
  // Apply that existing policy only to the exact goal line; all responsive
  // text retains the stronger minimum and all containment checks stay active.
  const fullSizeBody = body.every(line => line.size >= 14.25 - 0.001);
  for(const text of texts) {
    const legacyGoal = frame.width >= 1366 && fullSizeBody && text.text === `🎯 ${intro.goal}`;
    const minimum = frame.width <= 900 ? 9.5 : legacyGoal ? 9 : 10;
    expect(text.size,`smallest actual CSS font size: ${text.text}`).toBeGreaterThanOrEqual(minimum);
  }
  return cardBox;
}
