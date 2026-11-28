import { describe, expect, it } from 'vitest';
import { CHOICE_PANEL, getMarketChoicePlacement } from './marketTripRenderer.js';
const intersects=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)
  && Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);
describe('Market choice placement in a measured free region',()=>{
  for(const scale of [.5,.8,1,2]) it(`keeps the full card clear of controls at canvas scale ${scale}`,()=>{
    const view={scale,originX:30,originY:80,box:{left:40,top:90,right:1030,bottom:720},
      controls:[{left:50,top:490,right:230,bottom:700},{left:850,top:550,right:1010,bottom:670}]};
    const p=getMarketChoicePlacement(view);
    const card={left:p.x*scale+view.originX,top:p.y*scale+view.originY,
      right:(p.x+CHOICE_PANEL.width*p.zoom)*scale+view.originX,
      bottom:(p.y+CHOICE_PANEL.height*p.zoom)*scale+view.originY};
    expect(card.left).toBeGreaterThanOrEqual(view.box.left);expect(card.top).toBeGreaterThanOrEqual(view.box.top);
    expect(card.right).toBeLessThanOrEqual(view.box.right);expect(card.bottom).toBeLessThanOrEqual(view.box.bottom);
    view.controls.forEach(control=>expect(intersects(card,control)).toBe(false));
    expect((card.right-card.left)/(card.bottom-card.top)).toBeCloseTo(CHOICE_PANEL.width/CHOICE_PANEL.height);
  });
  it('supports renderer tests without a live canvas DOM',()=>expect(getMarketChoicePlacement(null)).toBeNull());
});
