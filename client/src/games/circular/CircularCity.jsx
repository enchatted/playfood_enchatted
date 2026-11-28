import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas } from '../../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import {
  updatePlayerMovement, isEnterJustPressed, isDropKeyPressed,
  checkInteraction, TILE_SIZE as TS, DIR,
} from '../engine/gameRoomLogic.js';
import {
  renderGameRoomTiles, renderGameRoomPlayer,
  renderGameRoomDecorations, renderHeldItem, renderActionPrompt, renderDropPrompt,
  spawnSparkles,
  updateParticles, renderParticles,
  updateRejectX, renderRejectX, OX, OY,
  initMissionIntro, renderMissionIntroCard,
  applyRoomCamera, releaseRoomCamera, roomToCanvas,
} from '../engine/gameRoomRenderer.js';
import {
  renderHubs, renderCommunity, renderCircularResidents, renderResourceDepot,
  renderResources, renderLoopMeter, renderLoopTokens, updateCircularResidents,
} from '../engine/circularCityRenderer.js';
import { renderRevealCard } from '../engine/whereDoesItGrowRenderer.js'; // reuse the generic reveal card
import { missionIntroSourceId } from '../engine/missionIntroLogic.js';
import { drawIrisWipe, IRIS_DURATION, getCanvasPointer } from '../../utils/canvas.js';
import {
  HUBS, RESOURCES, CIRCULAR_REVEALS, buildResourceSet, gradeCircularCity, loopValue,
  POINTS_CIRCULAR, redirectCircularResource, WRONG_HINT_KEYS, wrongDeliveryText,
} from '../../data/circular.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * CircularCity — Climate Change and Circular Economy, Mission 2 (PRACTICE).
 *
 * Walk a neighborhood and route household resources through the right circular hub
 * (Repair / Reuse / Recycle / Compost) to keep material AND money recirculating
 * locally — visualised by loop-back ♻️/🪙 tokens travelling to the community heart
 * and a rising "Neighborhood Loop" meter. The landfill is the linear leak: it
 * consumes the resource for good. Wrong circular hub = bounce + retry. Each channel
 * teaches a verbatim sourced fact; finishing opens the ResultScreen with the 3-source panel.
 */

const ROOM = GAME_ROOMS.CircularCity;
const isWalkable = (col, row) => isGameRoomWalkable(ROOM, col, row);
const RES_BY_ID = Object.fromEntries(RESOURCES.map((r) => [r.id, r]));

// MissionIntroCard content. The fact reuses the 10R-framework intro reveal, now
// as OUR plain sentence in the child's language with `paraphrase`, so the card no
// longer opens on a mid-clause policy fragment. title/steps/goal are ordinary translated UI.
function missionIntroFor(t) {
  return {
  titleKey: 'missionIntro.circularcity.title',
  stepKeys: [
    'missionIntro.circularcity.step1',
    'missionIntro.circularcity.step2',
    'missionIntro.circularcity.step3',
    'missionIntro.circularcity.step4', // How the stars are earned
  ],
  introFact: {
    sourceId: CIRCULAR_REVEALS.intro.sourceId,
    quote: t('circularcity.facts.intro', { defaultValue: CIRCULAR_REVEALS.intro.plain }),
    paraphrase: true,
  },
  goalKey: 'missionIntro.circularcity.goal',
  ctaKey: 'hint.skip_ab',
  };
}

// Loop-back tokens: ♻️ material always, 🪙 money for repair & share (money stays local).
function spawnLoopTokens(state, hubKey, fromX, fromY) {
  const { x: tx, y: ty } = state.communityPx;
  state.tokens.push({ sx: fromX, sy: fromY, tx, ty, t: 0, dur: 0.8, emoji: '♻️', leak: false });
  if (hubKey === 'repair' || hubKey === 'share') {
    state.tokens.push({ sx: fromX + 16, sy: fromY, tx, ty, t: 0, dur: 0.95, emoji: '🪙', leak: false });
  }
}

// Show a channel/leak reveal once; the LAST routed resource shows the win beat (final → complete()).
// lead = localized line above the fact.
// The card body is OUR plain sentence in the child's language with `paraphrase`,
// so the verbatim passage stays behind the source badge where it belongs.
function revealFor(state, key, extra) {
  const rec = CIRCULAR_REVEALS[key];
  const say = state.factStrings || {};
  return { quote: say[key] || rec.plain, sourceId: rec.sourceId, paraphrase: true, ...extra };
}

function finishOrReveal(state, key, lead) {
  const final = state.routedCount >= state.total;
  if (final) {
    // The celebratory Amsterdam beat is a REWARD, so it only fires on a run that actually
    // passed. A child who dumped everything in the landfill used to get congratulated and then
    // told they had failed (fixed 2026-08-06). A failed run closes on the landfill lesson.
    const { passed } = gradeCircularCity({
      correct: state.correctCount, total: state.total, leaks: state.leaks,
    });
    // The closing card carries our transfer line (state.winLead) above the city fact.
    const closing = passed
      ? revealFor(state, 'win', { final: true, lead: state.winLead || undefined })
      : revealFor(state, 'landfill', { final: true, tone: 'warning', lead });
    // Guaranteed: if the FIRST correct repair is also the LAST delivery, the repair card
    // comes first and the closing card follows on a SEPARATE continue press (reveal.next).
    if (key === 'repair' && CIRCULAR_REVEALS.repair && !state.shownReveals.has('repair')) {
      state.shownReveals.add('repair');
      state.reveal = revealFor(state, 'repair', { lead: state.repairLead || lead, next: closing });
      return;
    }
    state.reveal = closing;
    return;
  }
  // A channel may intentionally have no reveal (e.g. repair: its 40% stat was dropped as
  // misleading); route/score/loop still happen, we just skip the teach card.
  if (!state.shownReveals.has(key) && CIRCULAR_REVEALS[key]) {
    state.shownReveals.add(key);
    // Landfill teaches why to choose another destination; the resource remains recoverable.
    const extra = key === 'landfill' ? { lead, tone: 'warning' }
      : key === 'repair' ? { lead: state.repairLead || lead } // our "before you get something new" line
        : { lead };
    state.reveal = revealFor(state, key, extra);
  }
}

export default function CircularCity({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const atlasRef = useRef(null);
  const [atlasReady, setAtlasReady] = useState(false);

  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  // Pre-translate static strings used inside the (non-React) game loop.
  const i18nRef = useRef({});
  i18nRef.current = {
    pickupTemplate: t('circularcity.pickup_prompt', { item: '__I__' }),
    deliverTemplate: t('circularcity.deliver_prompt', { hub: '__H__' }),
    dropTemplate: t('circularcity.drop_prompt', { item: '__I__' }),
    routedProgressTemplate: t('circularcity.routed_progress', { current: '__C__', total: '__T__' }),
    keptProgressTemplate: t('circularcity.kept_progress', { current: '__C__', total: '__T__' }),
    loopLabel: t('circularcity.loop_label'),
    collectionPointLabel: t('circularcity.collection_point'),
    revealTitle: t('circularcity.reveal_title'),
    revealDismiss: t('circularcity.reveal_dismiss'),
    sourceHint: t('circularcity.source_hint'),
    correctToon: t('circularcity.correct_toon'),
    wrongToon: t('circularcity.wrong_toon'),
    winLead: t('circularcity.win_lead'),
    repairLead: t('circularcity.repair_lead'),
    wrongHints: Object.fromEntries(Object.entries(WRONG_HINT_KEYS).map(([id, key]) => [id, t(key)])),
    leakToon: t('circularcity.leak_toon'),
    // Our plain child-facing sentences, one per reveal beat, translated per locale with the
    // data file's English as the fallback.
    facts: Object.fromEntries(Object.entries(CIRCULAR_REVEALS).map(
      ([k, rec]) => [k, t(`circularcity.facts.${k}`, { defaultValue: rec.plain })],
    )),
    hub: {
      repair: t('circularcity.hub_repair'),
      share: t('circularcity.hub_share'),
      recycle: t('circularcity.hub_recycle'),
      compost: t('circularcity.hub_compost'),
      landfill: t('circularcity.hub_landfill'),
    },
    r: {
      repair: t('circularcity.r_repair'),
      share: t('circularcity.r_share'),
      recycle: t('circularcity.r_recycle'),
      compost: t('circularcity.r_compost'),
    },
  };

  const { gameState, setGameState, score, stateRef } = useGameRoomCanvas(canvasRef, {
    timeLimit: null, // PRACTICE — calm controlled simulation, no clock

    setup: (state) => {
      if (canvasRef.current) canvasRef.current._stateRef = stateRef;
      if (state.player) return;
      const L = i18nRef.current;
      const start = ROOM.playerStart;

      state.player = {
        col: start.col, row: start.row,
        pixelX: start.col * TS, pixelY: start.row * TS,
        dir: start.dir ?? DIR.UP,
        moving: false, moveTimer: 0,
        fromX: 0, fromY: 0, toX: 0, toY: 0,
      };

      state.time = 0;
      state.irisOpenness = 0;
      state.enterWasDown = false;
      state.qWasDown = false;

      const deck = buildResourceSet(8);
      state.resources = deck.map((r, i) => ({
        ...r,
        tile: ROOM.resourceSlots[i],
        name: t(r.nameKey),
        routed: false,
        correct: null,
      }));
      state.total = state.resources.length;

      state.nodes = HUBS.map((h) => ({
        key: h.key, emoji: h.emoji, isLeak: h.isLeak,
        label: L.hub[h.key],
        rLabel: h.rLabelKey ? L.r[h.key] : null,
        tiles: [ROOM.hubTiles[h.key]],
      }));

      state.carrying = null;
      state.heldItem = null;
      state.routedCount = 0;
      state.correctCount = 0;
      state.firstTryCount = 0;
      state.leaks = 0;
      state.loopMeter = 0;
      state.shownReveals = new Set();
      state.tokens = [];
      state.residents = (ROOM.residents || []).map((resident) => ({
        ...resident,
        x: resident.startCol,
      }));

      state.particles = [];
      state.floatingTexts = [];
      state.rejectX = null;
      state.screenShake = 0;
      state.screenShakeAmount = 0;
      state.hintNodeKey = null;
      state.hintTimer = 0;
      state.actionPrompt = null;
      state.facingNodeKey = null;

      state.loopLabel = L.loopLabel;
      state.collectionPointLabel = L.collectionPointLabel;
      state.routedProgressTemplate = L.routedProgressTemplate;
      state.keptProgressTemplate = L.keptProgressTemplate;
      state.revealTitle = L.revealTitle;
      state.revealDismiss = L.revealDismiss;
      state.sourceHint = L.sourceHint; // localized "press S / tap to open source"
      state.factStrings = L.facts;     // our plain sentences, translated
      state.winLead = L.winLead;       // transfer line on the closing card
      state.repairLead = L.repairLead; // our application line on the repair card

      // Community heart pixel (loop-back token target).
      state.communityPx = {
        x: OX + ROOM.community.col * TS + TS / 2,
        y: OY + ROOM.community.row * TS + TS / 2,
      };

      // Intro — shared MissionIntroCard (frames the loop) with the 🟢 10R fact.
      initMissionIntro(state, t, missionIntroFor(t));
    },

    update: (state, dt, keys, helpers) => {
      const L = i18nRef.current;
      if (!state.reveal && !state.showMissionIntro) state.time += dt;

      if (state.irisOpenness < 1) {
        state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
      }

      updateParticles(state, dt);
      updateRejectX(state, dt);
      updateCircularResidents(state, dt);

      // Advance loop-back tokens.
      for (const tk of state.tokens) tk.t = Math.min(1, tk.t + dt / tk.dur);
      state.tokens = state.tokens.filter((tk) => tk.t < 1);

      if (state.screenShakeAmount > 0.5) {
        state.screenShake = Math.sin(state.time * 50) * state.screenShakeAmount;
        state.screenShakeAmount *= 0.88;
      } else {
        state.screenShake = 0;
        state.screenShakeAmount = 0;
      }

      if (state.hintTimer > 0 && !state.reveal && !state.showMissionIntro) {
        state.hintTimer -= dt;
        if (state.hintTimer <= 0) state.hintNodeKey = null;
      }

      // Keep the carried item emoji in sync for renderHeldItem.
      const carriedResource = state.carrying
        ? state.resources.find((resource) => resource.id === state.carrying)
        : null;
      state.heldItem = carriedResource
        ? { id: carriedResource.id, emoji: carriedResource.emoji, name: carriedResource.name }
        : null;

      // ── MissionIntroCard (pause) ──
      if (state.showMissionIntro) {
        state.timerPaused = true;
        state.actionPrompt = null;
        state.dropPrompt = null;
        if (isEnterJustPressed(keys, state)) state.showMissionIntro = false;
        return;
      }

      // ── Reveal modal (pause) ──
      if (state.reveal) {
        state.timerPaused = true;
        state.actionPrompt = null;
        state.dropPrompt = null;
        if (isEnterJustPressed(keys, state)) {
          // A card may queue the next one (repair → closing). One press closes ONE card;
          // isEnterJustPressed is edge-triggered, so the queued card needs its own press.
          const { final, next } = state.reveal;
          state.reveal = next || null;
          if (!next && final === true) helpers.complete();
        }
        return;
      }

      state.timerPaused = false;
      if (state.irisOpenness < 1) return;

      // ── Walk + interaction ──
      updatePlayerMovement(state.player, dt, keys, isWalkable);

      const hub = state.nodes.find((h) => checkInteraction(state.player, h.tiles, 1));
      const homeRes = state.resources.find(
        (r) => !r.routed && r.id !== state.carrying && checkInteraction(state.player, [r.tile], 1),
      );
      state.facingNodeKey = hub ? hub.key : null;

      // Prompt.
      if (state.carrying && hub) state.actionPrompt = L.deliverTemplate.replace('__H__', hub.label);
      else if (!state.carrying && homeRes) state.actionPrompt = L.pickupTemplate.replace('__I__', homeRes.name);
      else state.actionPrompt = null;
      state.dropPrompt = carriedResource
        ? L.dropTemplate.replace('__I__', carriedResource.name)
        : null;

      const qDown = isDropKeyPressed(keys);
      const qJust = qDown && !state.qWasDown;
      state.qWasDown = qDown;
      if (qJust && state.carrying) {
        state.carrying = null;
        state.heldItem = null;
        state.dropPrompt = null;
        return;
      }

      if (!isEnterJustPressed(keys, state)) return;

      // ── PICK UP ──
      if (!state.carrying) {
        if (homeRes) state.carrying = homeRes.id;
        return;
      }

      // ── DELIVER (carrying) ──
      if (!hub) return;
      const res = RES_BY_ID[state.carrying];
      const liveRes = state.resources.find((r) => r.id === state.carrying);
      const hubTile = hub.tiles[0];
      const hubPx = { x: OX + hubTile.col * TS + TS / 2, y: OY + hubTile.row * TS + TS / 2 };

      if (hub.isLeak) {
        // Retain the resource for recovery; the retry affects first-attempt accuracy only.
        redirectCircularResource(state, res.correctNode);
        const wrongText = wrongDeliveryText(res.id, L.wrongToon, L.wrongHints);
        state.feedback = { text: wrongText, until: state.time + 4, warning: true };
        finishOrReveal(state, 'landfill', wrongText);
      } else if (hub.key === res.correctNode) {
        // CORRECT circular delivery — keep in loop.
        liveRes.routed = true;
        liveRes.correct = true;
        state.carrying = null;
        state.dropPrompt = null;
        state.correctCount++;
        if (!liveRes.retried) state.firstTryCount++;
        state.routedCount++;
        state.loopMeter = loopValue(state.correctCount, state.total);
        helpers.addScore(POINTS_CIRCULAR);
        spawnSparkles(state, hubPx.x, hubPx.y, '#3f9b6d', 12);
        spawnLoopTokens(state, hub.key, hubPx.x, hubPx.y);
        state.feedback = { text: `${L.correctToon} +${POINTS_CIRCULAR}`, until: state.time + 4 };
        finishOrReveal(state, hub.key, L.correctToon);
      } else {
        // WRONG circular hub: teach-don't-punish (Fridge/Compost parity), NO score
        // penalty, amber sparkles (not a red ✗), a gentle shake, keep carrying + hint the right
        // channel. The mistake is a redirect, not a loss.
        state.screenShakeAmount = 4;
        spawnSparkles(state, hubPx.x, hubPx.y, '#FFB74D', 8); // amber — the item isn't "the bad guy"
        state.feedback = { text: wrongDeliveryText(res.id, L.wrongToon, L.wrongHints), until: state.time + 4, warning: true };
        redirectCircularResource(state, res.correctNode);
      }
    },

    render: (ctx, state) => {
      if (!atlasRef.current) return;

      ctx.fillStyle = '#eef3f6';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // ── Zoom into neighborhood ──
      applyRoomCamera(ctx, ROOM);

      renderGameRoomTiles(ctx, ROOM.map, atlasRef.current);
      renderCommunity(ctx, ROOM, state);
      renderGameRoomDecorations(ctx, ROOM);
      renderHubs(ctx, state);
      renderResourceDepot(ctx, state, ROOM);
      renderResources(ctx, state);
      renderCircularResidents(ctx, state);
      renderGameRoomPlayer(ctx, state, atlasRef.current);
      renderHeldItem(ctx, state);
      renderParticles(ctx, state);
      renderRejectX(ctx, state);
      renderLoopTokens(ctx, state);

      releaseRoomCamera(ctx);

      // HUD elements at original canvas scale
      renderActionPrompt(ctx, state);
      renderDropPrompt(ctx, state);
      renderLoopMeter(ctx, state);
      renderRevealCard(ctx, state);

      // Iris wipe (convert player position to canvas coords for zoom)
      if (state.irisOpenness < 1) {
        const px = OX + state.player.pixelX + TS / 2;
        const py = OY + state.player.pixelY + TS / 2;
        const { x: canvasX, y: canvasY } = roomToCanvas(ROOM, px, py);
        drawIrisWipe(ctx, canvasX, canvasY, state.irisOpenness, CANVAS_W, CANVAS_H);
      }

      // Intro card sits on top of everything, including the opening iris (FIX-D).
      renderMissionIntroCard(ctx, state);
    },

    onComplete: () => {},
  });

  // Completion → ResultScreen (source panel wired for CircularCity via MISSION_SOURCES).
  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const s = stateRef.current;
      const total = s.total || 8;
      const { passed, tier } = gradeCircularCity({
        correct: s.correctCount || 0, total, leaks: s.leaks || 0, firstTryCount: s.firstTryCount || 0,
      });
      setTimeout(() => onComplete(score, passed, {
        tier, correct: s.correctCount || 0, total, leaks: s.leaks || 0, firstTryCount: s.firstTryCount || 0,
      }), 500);
    }
  }, [gameState]);

  useEffect(() => {
    if (atlasReady && gameState === 'INIT') setGameState('PLAYING');
  }, [atlasReady, gameState]);

  useEffect(() => {
    if (atlasReady && canvasRef.current) canvasRef.current.focus();
  }, [atlasReady]);

  // Source badge click: while a reveal card is open, a click/tap inside
  // state.sourceBadgeRect (canvas-pixel coords, set every frame by renderRevealCard)
  // opens the branded source viewer. Mirrors SoilDoctor.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onClick = (e) => {
      const state = stateRef.current;
      if (!state) return;
      const p = getCanvasPointer(canvas, e);
      // Intro card chip — rect is {x,y,width,height} (shared hitTest shape).
      const introId = missionIntroSourceId(state);
      const ir = state.introSourceRect;
      if (introId && ir
        && p.x >= ir.x && p.x <= ir.x + ir.width && p.y >= ir.y && p.y <= ir.y + ir.height) {
        window.open('/source.html?src=' + introId, '_blank', 'noopener');
        return;
      }
      // Reveal card chip — renderRevealCard writes {x,y,w,h}.
      const r = state.sourceBadgeRect;
      if (state.reveal && state.reveal.sourceId && r
        && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        window.open('/source.html?src=' + state.reveal.sourceId, '_blank', 'noopener');
      }
    };
    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [atlasReady]);

  // Source open via keyboard: press S while the intro or a reveal is open. Listens on
  // WINDOW (like the main key handler, useGameRoomCanvas.js:59) so it survives the
  // canvas losing focus after a header-button click (FIX-F). Real keydown handler (not
  // the RAF loop) so window.open counts as a user gesture; the loop is paused during
  // intro/reveal, so S never doubles as player movement here.
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || (e.key !== 's' && e.key !== 'S' && e.code !== 'KeyS')) return; // e.code: Greek layout sends 'σ'
      const state = stateRef.current;
      if (!state) return;
      const introId = missionIntroSourceId(state);
      if (introId) {
        window.open('/source.html?src=' + introId, '_blank', 'noopener');
        return;
      }
      if (state.reveal && state.reveal.sourceId) {
        window.open('/source.html?src=' + state.reveal.sourceId, '_blank', 'noopener');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [, setHudTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setHudTick(value => value + 1), 150);
    return () => clearInterval(id);
  }, []);
  const hudState = stateRef.current;
  const hudItem = hudState?.resources?.find(resource => resource.id === hudState.carrying);
  const hudFeedback = hudState?.feedback?.until > hudState?.time ? hudState.feedback : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#eef3f6', overflow: 'hidden' }}>
      <ScoreBar
        score={score}
        timeLeft={null}
        onPause={() => setGameState('PAUSED')}
        onInstructions={() => initMissionIntro(stateRef.current, t, missionIntroFor(t))}
        onExit={() => onNavigate('hub')}
        onFreeze={(f) => { const s = stateRef.current; if (s) s.exitConfirmOpen = f; }}
      />

      {!hudState?.reveal && !hudState?.showMissionIntro && (hudItem || hudFeedback) && (
        <div style={{ position: 'absolute', top: '62%', left: '50%', transform: 'translate(-50%, -50%)',
          maxWidth: 'calc(100% - 32px)', padding: '9px 18px', borderRadius: 16,
          background: hudFeedback?.warning ? '#fff1ce' : '#f4f8ec', color: '#274c36',
          border: '2px solid #537d60', fontSize: 'clamp(14px, 1.4vw, 20px)', fontWeight: 700,
          textAlign: 'center', pointerEvents: 'none', zIndex: 10 }}>
          {hudItem && <div>{hudItem.emoji} {hudItem.name}</div>}
          {hudFeedback && <div role="status">{hudFeedback.text}</div>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          tabIndex={0}
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: 'calc(100vh - 60px)',
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            objectFit: 'contain',
            imageRendering: 'pixelated',
            outline: 'none',
          }}
        />
      </div>

      {!atlasReady && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#eef3f6', color: '#2c5f86', fontSize: 24,
        }}>
          Loading...
        </div>
      )}

      {gameState === 'PAUSED' && (
        <PauseOverlay
          surfaceRef={canvasRef}
          onResume={() => setGameState('PLAYING')}
          onInstructions={() => initMissionIntro(stateRef.current, t, missionIntroFor(t))}
          onQuit={() => onNavigate('hub')}
        />
      )}
    </div>
  );
}
