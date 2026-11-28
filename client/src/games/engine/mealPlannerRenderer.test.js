import { describe, expect, it } from 'vitest';
import { OX, OY } from './gameRoomRenderer.js';
import { TILE_SIZE as TS } from './gameRoomLogic.js';

describe('Meal Planner visual zones', () => {
  it('separates home and market while keeping one concise market sign', async () => {
    const renderer = await import('./mealPlannerRenderer.js');

    expect(typeof renderer.getMealPlannerZoneVisuals).toBe('function');

    const visuals = renderer.getMealPlannerZoneVisuals({
      marketHeld: 2,
      marketCap: 9,
      labels: {
        fridgeZone: 'ΨΥΓΕΙΟ',
        marketZone: 'ΑΓΟΡΑ',
        marketCount: (used, total) => `Αγορές: ${used}/${total}`,
      },
    });

    expect(visuals.fridgePanel.x + visuals.fridgePanel.width).toBeLessThan(visuals.marketPanel.x);
    expect(visuals.fridgePanel.fill).not.toBe(visuals.marketPanel.fill);
    expect(visuals.fridgePanel.x + visuals.fridgePanel.width / 2).toBe(visuals.fridgeSign.x);
    expect(visuals.marketPanel.x + visuals.marketPanel.width / 2).toBe(visuals.marketSign.x);
    expect(visuals.fridgeSign.y).toBe(visuals.marketSign.y);
    expect(visuals.marketLabel).toBe('🛒 Αγορές: 2/9');
    expect(visuals.fridgePanel.fill).toContain('0.08');
    expect(visuals.marketPanel.fill).toContain('0.08');
  });

  it('keeps both side zones equally inset from the room walls and symmetric', async () => {
    const { getMealPlannerZoneVisuals } = await import('./mealPlannerRenderer.js');
    const visuals = getMealPlannerZoneVisuals();
    const interiorLeft = OX + TS;
    const interiorRight = OX + 19 * TS;
    const roomCenter = OX + 10 * TS;

    const leftInset = visuals.fridgePanel.x - interiorLeft;
    const rightInset = interiorRight - (visuals.marketPanel.x + visuals.marketPanel.width);
    const fridgeCenter = visuals.fridgePanel.x + visuals.fridgePanel.width / 2;
    const marketCenter = visuals.marketPanel.x + visuals.marketPanel.width / 2;

    expect(leftInset).toBeGreaterThanOrEqual(24);
    expect(rightInset).toBe(leftInset);
    expect(roomCenter - fridgeCenter).toBe(marketCenter - roomCenter);
  });

  it('uses readable category contrast and the translated tofu label', async () => {
    const {
      getMealPlannerCategoryStyle,
      getMealPlannerFoodGlyphLabel,
    } = await import('./mealPlannerRenderer.js');

    expect(getMealPlannerCategoryStyle('carb')).toMatchObject({ textColor: '#3E2723', maxFontSize: 9 });
    expect(getMealPlannerCategoryStyle('fruit')).toMatchObject({ textColor: '#FFFFFF', maxFontSize: 9 });
    expect(getMealPlannerFoodGlyphLabel({ id: 'tofu' }, { nameOf: () => 'Τόφου' })).toBe('Τόφου');
    expect(getMealPlannerFoodGlyphLabel({ id: 'bread' }, { nameOf: () => 'Ψωμί' })).toBeNull();
  });

  it('keeps every shelf backing and plank inside its zone panel', async () => {
    const { getMealPlannerShelfGeometry } = await import('./mealPlannerRenderer.js');
    const panel = { x: 100, width: 112 };
    const shelf = getMealPlannerShelfGeometry(panel);

    for (const part of [shelf.backing, shelf.plank]) {
      expect(part.x).toBeGreaterThanOrEqual(panel.x);
      expect(part.x + part.width).toBeLessThanOrEqual(panel.x + panel.width);
    }
    expect(shelf.plank).toEqual(shelf.backing);
  });

  it('keeps market products below the category sign', async () => {
    const { getMealPlannerMarketShelfLayout } = await import('./mealPlannerRenderer.js');
    const layout = getMealPlannerMarketShelfLayout(200);
    const categoryBottom = layout.category.y + layout.category.height;
    const productTop = layout.itemY - layout.itemHalfHeight;

    expect(categoryBottom).toBeLessThan(productTop);
    expect(layout.backing.y).toBeLessThanOrEqual(layout.category.y);
    expect(layout.plankY).toBeGreaterThan(layout.itemY);
  });

  it('falls back to the geometric centre of the 2×2 active plate', async () => {
    const { getMealPlannerPlateCenter } = await import('./mealPlannerRenderer.js');

    expect(getMealPlannerPlateCenter()).toEqual({ col: 10, row: 7 });
    expect(getMealPlannerPlateCenter({ plateCenter: { col: 8, row: 5 } }))
      .toEqual({ col: 8, row: 5 });
  });
});

describe('Meal Planner kitchen menu-board', () => {
  it('lays out one compact board in room-world coordinates across central wall columns 6–14', async () => {
    const { getMealPlannerMenuBoardGeometry } = await import('./mealPlannerRenderer.js');
    const geometry = getMealPlannerMenuBoardGeometry();

    expect(geometry.space).toBe('room-world');
    expect(geometry.board).toEqual({ x: 512, y: 122, width: 256, height: 48 });
    expect(geometry.board.x).toBe(OX + 6 * TS);
    expect(geometry.board.x + geometry.board.width).toBe(OX + 14 * TS);
    expect(geometry.board.y).toBe(OY + 10);
    expect(geometry.surface).toEqual({ x: 516, y: 126, width: 248, height: 40 });
    expect(geometry.tickets).toHaveLength(3);
    expect(geometry.tickets.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 522, y: 147, width: 75, height: 18 },
      { x: 602, y: 147, width: 75, height: 18 },
      { x: 682, y: 147, width: 75, height: 18 },
    ]);

    geometry.tickets.forEach((ticket) => {
      expect(ticket.x).toBeGreaterThanOrEqual(geometry.surface.x);
      expect(ticket.x + ticket.width).toBeLessThanOrEqual(geometry.surface.x + geometry.surface.width);
      expect(ticket.y + ticket.height).toBeLessThanOrEqual(geometry.surface.y + geometry.surface.height);
    });
  });

  it('derives translated names and distinct complete, active, and locked ticket states', async () => {
    const { getMealPlannerMenuBoardModel } = await import('./mealPlannerRenderer.js');
    const model = getMealPlannerMenuBoardModel({
      activePlate: 1,
      labels: {
        menuBoardTitle: 'ΤΟ ΜΕΝΟΥ ΜΑΣ',
        mealName: (meal) => ({ breakfast: 'Πρωινό', lunch: 'Μεσημεριανό', dinner: 'Βραδινό' })[meal],
      },
      plates: [
        { meal: 'breakfast', slots: [{ item: 'bread' }, { item: 'apple' }] },
        { meal: 'lunch', slots: [{ item: 'rice' }, { item: null }, { item: null }] },
        { meal: 'dinner', slots: [{ item: null }, { item: null }] },
      ],
    });

    expect(model.title).toBe('ΤΟ ΜΕΝΟΥ ΜΑΣ');
    expect(model.tickets.map(({ name, status, badge }) => ({ name, status, badge }))).toEqual([
      { name: 'Πρωινό', status: 'complete', badge: '✓' },
      { name: 'Μεσημεριανό', status: 'active', badge: '1/3' },
      { name: 'Βραδινό', status: 'locked', badge: '🔒' },
    ]);
    expect(model.tickets[0].visual.fill).toBe('#2E7D32');
    expect(model.tickets[1].visual.border).toBe('#FFB74D');
    expect(model.tickets[2].visual.alpha).toBeLessThan(model.tickets[1].visual.alpha);
    expect(model.tickets.every(({ visual }) => visual.fill !== '#FFF8E1')).toBe(true);
  });

  it('gives the longest real meal locale its own upper row without colliding with the badge', async () => {
    const {
      getMealPlannerMenuBoardGeometry,
      getMealPlannerMenuBoardModel,
    } = await import('./mealPlannerRenderer.js');
    const model = getMealPlannerMenuBoardModel({
      activePlate: 0,
      labels: { mealName: () => 'Pequeno-almoço' },
      plates: [{ meal: 'breakfast', slots: [{ item: null }, { item: null }] }],
    });
    const content = getMealPlannerMenuBoardGeometry().tickets[0].content;

    expect(model.tickets[0].name).toBe('Pequeno-almoço');
    expect(content.name).toMatchObject({ maxWidth: 55, minFontSize: 5 });
    expect(content.name.maxWidth).toBeGreaterThan(45.36);
    expect(content.name.x).toBeGreaterThan(content.icon.x);
    expect(content.name.y).toBeLessThan(content.badge.y);
  });

  it('uses safe board and meal-name fallbacks when translated labels are blank or absent', async () => {
    const { getMealPlannerMenuBoardModel } = await import('./mealPlannerRenderer.js');
    const model = getMealPlannerMenuBoardModel({
      activePlate: 0,
      labels: { menuBoardTitle: '   ', mealName: () => '' },
      plates: [{ meal: 'breakfast', slots: [] }],
    });

    expect(model.title).toBe('Menu');
    expect(model.tickets[0].name).toBe('breakfast');
    expect(model.tickets[0]).toMatchObject({ status: 'active', badge: '0/0' });
  });

  it('never treats an empty socket list as a completed plate', async () => {
    const { getMealPlannerActivePlateModel } = await import('./mealPlannerRenderer.js');
    const model = getMealPlannerActivePlateModel({
      activePlate: 0,
      plates: [{ meal: 'breakfast', slots: [] }],
    });

    expect(model.complete).toBe(false);
  });

  it('keeps the active plate presentation focused on sockets instead of repeating the meal title', async () => {
    const { getMealPlannerActivePlateModel } = await import('./mealPlannerRenderer.js');
    const model = getMealPlannerActivePlateModel({
      activePlate: 0,
      plateCenter: { col: 10, row: 7 },
      labels: { mealName: () => 'Μεσημεριανό' },
      plates: [{
        meal: 'lunch',
        slots: [{ type: 'carb', item: 'rice' }, { type: 'veg', item: null }],
      }],
    });

    expect(model).toEqual({
      center: { col: 10, row: 7 },
      complete: false,
      missingTypes: ['veg'],
      slots: [{ type: 'carb', item: 'rice' }, { type: 'veg', item: null }],
    });
  });

  it('uses neutral category sockets instead of foods that may not exist in this scenario', async () => {
    const { getMealPlannerEmptySlotVisual } = await import('./mealPlannerRenderer.js');

    for (const type of ['carb', 'protein', 'veg', 'fruit']) {
      expect(getMealPlannerEmptySlotVisual(type)).toMatchObject({
        glyph: '+',
        showFood: false,
        fill: expect.any(String),
        border: expect.any(String),
      });
    }
  });

  it('names missing categories without showing concrete food emoji', async () => {
    const { getMealPlannerMissingText } = await import('./mealPlannerRenderer.js');
    const labels = {
      missingShort: 'Λείπει:',
      slotLabel: (type) => ({ carb: 'Δημητριακό', fruit: 'Φρούτο' })[type],
    };

    expect(getMealPlannerMissingText(['carb', 'fruit'], labels))
      .toBe('Λείπει: Δημητριακό · Φρούτο');
  });

  it('removes a used fridge food and leaves only a completed-position marker', async () => {
    const { getMealPlannerFridgeItemVisual } = await import('./mealPlannerRenderer.js');

    expect(getMealPlannerFridgeItemVisual({ used: true })).toEqual({
      showFood: false,
      badge: '✓',
      dim: true,
    });
    expect(getMealPlannerFridgeItemVisual({ used: false })).toEqual({
      showFood: true,
      badge: null,
      dim: false,
    });
  });
});

describe('Meal Planner result stars', () => {
  it.each([
    ['perfect', '★★★'],
    ['great', '★★☆'],
    ['pass', '★☆☆'],
    ['fail', '☆☆☆'],
  ])('renders %s as one complete three-glyph row', async (tier, expected) => {
    const { getMealPlannerTierStars } = await import('./mealPlannerRenderer.js');

    expect(getMealPlannerTierStars(tier)).toBe(expected);
    expect([...getMealPlannerTierStars(tier)]).toHaveLength(3);
  });

  it.each([
    ['perfect', [true, true, true]],
    ['great', [true, true, false]],
    ['pass', [true, false, false]],
    ['fail', [false, false, false]],
  ])('exposes %s as three independently drawable star states', async (tier, expected) => {
    const { getMealPlannerTierStarStates } = await import('./mealPlannerRenderer.js');

    expect(getMealPlannerTierStarStates(tier)).toEqual(expected);
  });
});

describe('Meal Planner recap card layout', () => {
  it('wraps every paragraph inside the card, grows with the text and draws no bars', async () => {
    const { getMealPlannerRecapLayout, RECAP_CARD } = await import('./mealPlannerRenderer.js');
    const ctx = { font: '', measureText: (text) => ({ width: String(text).length * 7 }) };
    const view = { pctLabel: 'x', paragraphs: [
      { key: 'waste', icon: '🗑️', text: 'Χρησιμοποίησες από τα «Πρώτα!»: φράουλα 🍓, ψωμί 🍞. Έμεινε στο ψυγείο και χάλασε: μπανάνα 🍌. Αγόρασες το ίδιο τρόφιμο από την αγορά. Την επόμενη φορά, από το ψυγείο: μπανάνα 🍌.' },
      { key: 'sustainability', icon: '🌱', text: 'Τα περισσότερα τρόφιμα στα πιάτα σου ήταν φυτικά και της εποχής.' },
      { key: 'nutrition', icon: '🍽️', text: 'Γέμισαν και οι 14 θέσεις.' },
    ] };
    const layout = getMealPlannerRecapLayout(ctx, view);
    const short = getMealPlannerRecapLayout(ctx, { ...view, paragraphs: view.paragraphs.slice(1) });
    expect(layout.paragraphs.map((p) => p.key)).toEqual(['waste', 'sustainability', 'nutrition']);
    for (const p of layout.paragraphs) {
      expect(p.lines.map((l) => l.text).join(' ')).toBe(view.paragraphs.find((v) => v.key === p.key).text);
      for (const l of p.lines) {
        expect(ctx.measureText(l.text).width).toBeLessThanOrEqual(layout.textW);
        expect(l.y + RECAP_CARD.lineH / 2).toBeLessThanOrEqual(layout.y + layout.height - RECAP_CARD.footerH + 1e-9);
      }
    }
    expect(layout.paragraphs[0].lines.length).toBeGreaterThan(1);
    expect(layout.height).toBeGreaterThan(short.height);
  });
});

describe('Meal Planner contextual coach and control dock', () => {
  it('keeps world furniture out of the fixed HUD layout and the transient coach compact', async () => {
    const { getMealPlannerHudLayout } = await import('./mealPlannerRenderer.js');
    const layout = getMealPlannerHudLayout();

    expect(layout).not.toHaveProperty('progress');
    expect(layout.coach).toEqual({ x: 448, y: 80, width: 384, height: 56 });
    expect(layout.controls).toMatchObject({ x: 448, width: 384, height: 34 });
    expect(layout.controls.y + layout.controls.height).toBeLessThan(664);
  });

  it('hides an empty dock and only offers Q while carrying or after an undoable action', async () => {
    const { getMealPlannerControlDockModel } = await import('./mealPlannerRenderer.js');
    const base = {
      phase: 'play', showMissionIntro: false, labels: { undoHint: 'Q · Αναίρεση' },
    };

    expect(getMealPlannerControlDockModel({ ...base, heldItem: null, history: [] })).toBeNull();
    expect(getMealPlannerControlDockModel({ ...base, heldItem: { id: 'rice' }, history: [] }))
      .toMatchObject({ mode: 'undo', text: 'Q · Αναίρεση' });
    expect(getMealPlannerControlDockModel({ ...base, heldItem: null, history: [{}] }))
      .toMatchObject({ mode: 'undo', text: 'Q · Αναίρεση' });
  });

  it('shows the action dock only for a real prompt and keeps all play HUD off overlays', async () => {
    const {
      getMealPlannerControlDockModel,
      getMealPlannerTeachToastModel,
      mealPlannerHudVisible,
    } = await import('./mealPlannerRenderer.js');

    expect(getMealPlannerControlDockModel({
      phase: 'play', showMissionIntro: false, actionPrompt: '  E · Μαγείρεψε  ', history: [],
    })).toMatchObject({ mode: 'action', text: 'E · Μαγείρεψε' });
    expect(getMealPlannerControlDockModel({
      phase: 'play', showMissionIntro: false, actionPrompt: '   ', history: [],
    })).toBeNull();
    expect(getMealPlannerControlDockModel({
      phase: 'results', showMissionIntro: false, actionPrompt: 'E · Συνέχεια', history: [{}],
    })).toBeNull();
    expect(getMealPlannerTeachToastModel({ phase: 'play', toast: { text: 'Μπράβο!', life: 1 } }))
      .toEqual({ text: 'Μπράβο!', life: 1 });
    expect(getMealPlannerTeachToastModel({
      phase: 'play', showMissionIntro: true, toast: { text: 'Μπράβο!', life: 1 },
    })).toBeNull();
    expect(getMealPlannerTeachToastModel({
      phase: 'results', toast: { text: 'Μπράβο!', life: 1 },
    })).toBeNull();

    expect(mealPlannerHudVisible({ phase: 'play', showMissionIntro: false })).toBe(true);
    expect(mealPlannerHudVisible({ phase: 'play', showMissionIntro: true })).toBe(false);
    expect(mealPlannerHudVisible({ phase: 'results', showMissionIntro: false })).toBe(false);
  });
});

describe('Meal Planner season leaf', () => {
  it('marks only foods the score counts as in season, never processed ones', async () => {
    const { showsSeasonLeaf } = await import('./mealPlannerRenderer.js');
    expect(showsSeasonLeaf('pumpkin', 'autumn')).toBe(true);
    expect(showsSeasonLeaf('strawberry', 'autumn')).toBe(false);
    expect(showsSeasonLeaf('rice', 'autumn')).toBe(true);
    expect(showsSeasonLeaf('soda', 'autumn')).toBe(false);
    expect(showsSeasonLeaf('pumpkin', undefined)).toBe(false);
  });
});
