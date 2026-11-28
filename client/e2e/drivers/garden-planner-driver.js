/**
 * Browser-side decision driver for the complete Garden Planner cycle.
 * It positions the avatar at the next meaningful interaction; the caller owns
 * the real input surface (keyboard or TouchDpad) used to perform the action.
 */
export function stepGardenPlanner() {
  const TS = 32, DIR_UP = 1;
  const cv = document.querySelector('canvas');
  const st = cv && cv._stateRef && cv._stateRef.current;
  const store = window.__playfood.state();
  if (store.currentScreen === 'result') return { act: 'done', nav: store.navigationData };
  if (!st || !st.player) return { act: 'wait', ms: 150 };

  const face = (t) => {
    const p = st.player;
    p.col = t.col; p.row = t.row + 1;
    p.pixelX = p.col * TS; p.pixelY = p.row * TS;
    p.fromX = p.pixelX; p.fromY = p.pixelY; p.toX = p.pixelX; p.toY = p.pixelY;
    p.moving = false; p.moveTimer = 0; p.dir = DIR_UP;
  };

  if (st.showMissionIntro) return { act: 'enter' };
  if (st.irisOpenness < 1) return { act: 'wait', ms: 120 };
  if (st.decisionEvent) {
    if (!st.decisionEvent.answered) return { act: 'enter' };
    if ((st.decisionEvent.resultTimer || 0) < 0.45) return { act: 'wait', ms: 150 };
    return { act: 'enter' };
  }
  if (st.pendingEvent) return { act: 'wait', ms: 200 };

  const carrying = st.carrying;

  if (st.phase === 'PLANT') {
    if (carrying && carrying.seed) {
      const plot = st.plots.find((p) => p.season === st.activeSeason && !p.seed);
      if (plot) { face(plot); return { act: 'enter' }; }
      return { act: 'wait', ms: 120 };
    }
    const usedThisSeason = new Set(
      st.plots
        .filter((plot) => plot.season === st.activeSeason && plot.seed)
        .map((plot) => plot.seed.id),
    );
    const crate = st.seedCrates.find((candidate) => (
      candidate.validSeasons.includes(st.activeSeason)
      && !usedThisSeason.has(candidate.seedId)
    ));
    if (crate) { face(crate); return { act: 'enter' }; }
    return { act: 'wait', ms: 120 };
  }

  if (st.phase === 'WATER') {
    if (carrying && carrying.tool === 'water') {
      const target = st.waterRound === 2 ? 1 : 0;
      const plot = st.plots.find((p) => p.seed && !p.wilted && p.health === target);
      if (plot) { face(plot); return { act: 'hold', ms: 2350 }; }
      return { act: 'wait', ms: 150 };
    }
    const tool = st.toolTiles.find((tt) => tt.tool === 'water');
    face(tool); return { act: 'enter' };
  }

  if (st.phase === 'HARVEST') {
    if (carrying && carrying.tool === 'harvest') {
      const plot = st.plots.find((p) => p.seed && !p.harvested && !p.wilted && p.health >= 2);
      if (plot) { face(plot); return { act: 'enter' }; }
      return { act: 'wait', ms: 200 };
    }
    const tool = st.toolTiles.find((tt) => tt.tool === 'harvest');
    face(tool); return { act: 'enter' };
  }

  return { act: 'wait', ms: 150 };
}
