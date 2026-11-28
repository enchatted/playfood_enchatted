import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas } from '../../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import {
  updatePlayerMovement, isEnterJustPressed, checkInteraction, TILE_SIZE as TS, DIR,
} from '../engine/gameRoomLogic.js';
import {
  renderGameRoomTiles, renderGameRoomPlayer,
  renderGameRoomDecorations, renderActionPrompt,
  spawnSparkles, spawnFloatingText,
  updateParticles, renderParticles, updateFloatingTexts, renderFloatingTexts,
  updateRejectX, renderRejectX, OX, OY,
  applyRoomCamera, releaseRoomCamera, roomToCanvas,
  initMissionIntro, renderMissionIntroCard,
} from '../engine/gameRoomRenderer.js';
import {
  renderBoundaryRing, renderConsoles, renderChoiceModal, renderMissionControlDeck,
  renderChoiceFeedback, renderPlanetaryObservationLab, updatePlanetaryTechnicians,
} from '../engine/planetaryBoundariesRenderer.js';
import { renderRevealCard } from '../engine/whereDoesItGrowRenderer.js'; // reuse the generic sourced-fact card
import { missionIntroSourceId } from '../engine/missionIntroLogic.js';
import { drawIrisWipe, IRIS_DURATION, getCanvasPointer } from '../../utils/canvas.js';
import {
  PB_CONSOLES, PB_REVEALS, planetaryScoreForTransgressed,
  buildBoundaries, applyChoice, countTransgressed, gradePlanetaryBoundaries,
  planetaryStarsForTransgressed, summarizePlanetaryChoice, displayOptions,
  choiceEffectChanges, PB_APPLY,
} from '../../data/circular.js';
import { SOURCES } from '../../data/sources.js';
import { useBlockingCanvasOverlay } from '../../components/ActiveCanvasStage.jsx';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';

/**
 * PlanetaryBoundaries — Climate Change and Circular Economy, Mission 3 (CHALLENGE).
 *
 * A "Planetary Mission Control": the 9-boundary ring sits at the centre (starting at
 * the authentic 7-of-9 transgressed). The player walks to 4 consumption consoles and
 * makes a strategic choice at each (← high-impact / → mindful). Choices apply coupled
 * trade-offs across the boundaries; the safe operating space is an ABSOLUTE limit, so
 * even perfect play leaves one boundary beyond its limit. Bring transgressed ≤ 3 → ResultScreen with
 * the 2-source panel (Stockholm + Amsterdam doughnut).
 */

const ROOM = GAME_ROOMS.PlanetaryBoundaries;
const isWalkable = (col, row) => isGameRoomWalkable(ROOM, col, row);

// Shared MissionIntroCard. The fact reuses PB_REVEALS.intro, now as OUR plain
// sentence in the child's language with `paraphrase`; the Stockholm verbatim is a
// keypress away behind the badge. title/steps/goal are free UI text.
function missionIntroFor(t) {
  return {
    titleKey: 'missionIntro.planetaryboundaries.title',
    stepKeys: [
      'missionIntro.planetaryboundaries.step1',
      'missionIntro.planetaryboundaries.step2',
      'missionIntro.planetaryboundaries.step3',
      'missionIntro.planetaryboundaries.step4', // How the stars are earned
    ],
    introFact: {
      sourceId: PB_REVEALS.intro.sourceId,
      quote: t('planetary.facts.intro', { defaultValue: PB_REVEALS.intro.plain }),
      paraphrase: true,
    },
    goalKey: 'missionIntro.planetaryboundaries.goal',
    ctaKey: 'hint.skip_ab',
  };
}

export default function PlanetaryBoundaries({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const atlasRef = useRef(null);
  const [atlasReady, setAtlasReady] = useState(false);
  const [headerProgress, setHeaderProgress] = useState({ decisions: 0, stars: 0 });
  const [applyView, setApplyView] = useState(null);

  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  // Pre-translate static strings used inside the (non-React) game loop.
  const i18nRef = useRef({});
  i18nRef.current = {
    consoleTemplate: t('planetary.console_prompt', { domain: '__D__' }),
    chooseHint: t('planetary.choose_hint'),
    chooseFirst: t('planetary.choose_first'),
    optionLabelTemplate: t('planetary.option_label', { letter: '__L__' }),
    selectedLabel: t('planetary.selected'),
    affectsLabel: t('planetary.affects'),
    feedbackImproved: t('planetary.feedback_improved', { before: '__B__', after: '__A__' }),
    feedbackUnchanged: t('planetary.feedback_unchanged', { before: '__B__', after: '__A__' }),
    feedbackCaution: t('planetary.feedback_caution', { before: '__B__', after: '__A__' }),
    satelliteStationLabel: t('planetary.satellite_station'),
    earthStationLabel: t('planetary.earth_station'),
    safeSpaceLabel: t('planetary.safe_space_label'),
    safeCountTemplate: t('planetary.safe_count', { n: '__N__' }),
    decisionProgressTemplate: t('planetary.decision_progress', { current: '__C__', total: '__T__' }),
    revealTitle: t('planetary.reveal_title'),
    revealDismiss: t('planetary.reveal_dismiss'),
    sourceHint: t('planetary.source_hint'),
    winToon: t('planetary.win_toon'),
    effectsBetter: t('planetary.effects_better', { list: '__L__' }),
    effectsWorse: t('planetary.effects_worse', { list: '__L__' }),
    loseToon: t('planetary.lose_toon'),
    // Our plain child-facing sentences per reveal beat, translated, with the data file's
    // English as the fallback.
    facts: Object.fromEntries(Object.entries(PB_REVEALS).map(
      ([k, rec]) => [k, t(`planetary.facts.${k}`, { defaultValue: rec.plain })],
    )),
  };

  const { gameState, setGameState, score, stateRef } = useGameRoomCanvas(canvasRef, {
    onEscape: (state) => {
      if (state.applyStep) return true; // the application step has no «back»
      if (!state.choice || state.showMissionIntro || state.reveal) return false;
      state.choice = null;
      state.timerPaused = false;
      state.leftWasDown = false;
      state.rightWasDown = false;
      return true;
    },
    timeLimit: null, // CHALLENGE — synthesis, not speed

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
      state.leftWasDown = false;
      state.rightWasDown = false;

      // 9 boundaries with translated short labels for the ring.
      state.boundaries = buildBoundaries().map((b) => ({ ...b, short: t(`planetary.bs_${b.key}`) }));
      state.transgressedCount = countTransgressed(state.boundaries); // 7

      state.consoles = PB_CONSOLES.map((c) => ({
        key: c.key, emoji: c.emoji,
        label: t(c.labelKey), prompt: t(c.promptKey),
        tiles: [ROOM.consoleTiles[c.key]], chosen: false,
        // On-screen order (left, right): the whole option moves with it.
        options: displayOptions(c.key, c.options).map((o) => ({
          id: o.id, desc: t(o.descKey), revealKey: o.revealKey, effects: o.effects,
        })),
      }));

      state.choice = null;
      state.choiceFeedback = null;
      state.choicesMade = 0;
      state.technicians = (ROOM.technicians || []).map((technician) => ({
        ...technician,
        x: technician.startCol,
      }));
      state.satelliteStationLabel = L.satelliteStationLabel;
      state.earthStationLabel = L.earthStationLabel;
      state.reveal = null;
      state.shownReveals = new Set();
      // The application step after the final reveal has its OWN state, never
      // part of shownReveals (repeated «Did you know?» cards are skipped; this step is not).
      state.applyStep = null;
      state.ringPulse = 0;

      state.particles = [];
      state.floatingTexts = [];
      state.rejectX = null;
      state.screenShake = 0;
      state.screenShakeAmount = 0;
      state.actionPrompt = null;
      state.facingConsoleKey = null;

      state.chooseHint = L.chooseHint;
      state.chooseFirst = L.chooseFirst;
      state.optionLabelTemplate = L.optionLabelTemplate;
      state.selectedLabel = L.selectedLabel;
      state.affectsLabel = L.affectsLabel;
      state.safeSpaceLabel = L.safeSpaceLabel;
      state.safeCountTemplate = L.safeCountTemplate;
      state.decisionProgressTemplate = L.decisionProgressTemplate;
      state.revealTitle = L.revealTitle;
      state.revealDismiss = L.revealDismiss;
      state.sourceHint = L.sourceHint; // localized "press S / tap to open source"
      state.ringCenterPx = {
        x: OX + ROOM.ringCenter.col * TS + TS / 2,
        y: OY + ROOM.ringCenter.row * TS + TS / 2,
      };

      // Intro — shared MissionIntroCard (frames Mission Control) with the 🟢 safe-space fact.
      // The 4 mid-game reveals (crossing/lifesupport/doughnut/win) still use state.reveal.
      initMissionIntro(state, t, missionIntroFor(t));
    },

    update: (state, dt, keys, helpers) => {
      const L = i18nRef.current;
      state.time += dt;
      state.decisionProgressLabel = state.decisionProgressTemplate
        .replace('__C__', Math.min(state.choicesMade + 1, state.consoles.length))
        .replace('__T__', state.consoles.length);

      if (state.irisOpenness < 1) {
        state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
      }

      updateParticles(state, dt);
      updateFloatingTexts(state, dt);
      updateRejectX(state, dt);
      updatePlanetaryTechnicians(state, dt);
      if (state.ringPulse > 0) state.ringPulse = Math.max(0, state.ringPulse - dt);
      // the feedback only counts down while it can be read (not behind Instructions / exit confirm)
      if (state.choiceFeedback && !state.reveal && !state.showMissionIntro && !state.exitConfirmOpen) {
        state.choiceFeedback.timer -= dt;
        if (state.choiceFeedback.timer <= 0) state.choiceFeedback = null;
      }

      if (state.screenShakeAmount > 0.5) {
        state.screenShake = Math.sin(state.time * 50) * state.screenShakeAmount;
        state.screenShakeAmount *= 0.88;
      } else {
        state.screenShake = 0;
        state.screenShakeAmount = 0;
      }

      // ── MissionIntroCard (pause). Shown once at start; iris opens
      // behind it (advanced at the top of update). ENTER dismisses; S/click opens source.
      if (state.showMissionIntro) {
        state.timerPaused = true;
        state.actionPrompt = null;
        if (state.applyStep) state.applyStep.needRelease = true; // F2: rearm on return
        if (isEnterJustPressed(keys, state)) state.showMissionIntro = false;
        return;
      }

      // ── Application step (DOM card, PlanetaryApplyStep) ──
      // Required: a pick, then the explanation, then Continue → result. No points, no stars,
      // no fail: the score was set by the boundaries before this step and is not touched.
      if (state.applyStep) {
        const step = state.applyStep;
        state.timerPaused = true;
        state.actionPrompt = null;
        // F2 (06/10): coming back to the step from Instructions, Pause or the exit
        // confirm (the loop did not see it for a while, or the exit confirm is open now), a
        // key still held from there must not pick / answer / continue: wait for a release.
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (state.exitConfirmOpen || (step.lastSeen && now - step.lastSeen > 150)) step.needRelease = true;
        step.lastSeen = now;
        if (state.exitConfirmOpen) return;
        if (step.needRelease) {
          const held = ['arrowleft', 'arrowright', 'a', 'd', 'keya', 'keyd', 'enter', ' '].some((k) => keys.has(k));
          state.leftWasDown = keys.has('arrowleft') || keys.has('a') || keys.has('keya');
          state.rightWasDown = keys.has('arrowright') || keys.has('d') || keys.has('keyd');
          state.enterWasDown = keys.has('enter') || keys.has(' ');
          if (held) { step.tapped = null; step.continueReq = false; return; }
          step.needRelease = false;
        }
        const left = keys.has('arrowleft') || keys.has('a') || keys.has('keya');
        const right = keys.has('arrowright') || keys.has('d') || keys.has('keyd');
        if (step.answer === null) {
          // A NEW press selects (an arrow still held does not)
          if (left && !state.leftWasDown) { step.sel = 0; step.needsPick = false; }
          if (right && !state.rightWasDown) { step.sel = 1; step.needsPick = false; }
        }
        state.leftWasDown = left;
        state.rightWasDown = right;
        const enter = isEnterJustPressed(keys, state);
        if (step.answer === null) {
          if (step.tapped === 0 || step.tapped === 1) { step.sel = step.tapped; step.answer = step.tapped; step.tapped = null; return; }
          if (enter) {
            if (step.sel !== 0 && step.sel !== 1) step.needsPick = true;
            else step.answer = step.sel;
          }
          return;
        }
        if (enter || step.continueReq) {
          state.applyStep = null;
          helpers.complete();
        }
        return;
      }

      // ── Reveal modal (pause) ──
      if (state.reveal) {
        state.timerPaused = true;
        state.actionPrompt = null;
        if (isEnterJustPressed(keys, state)) {
          const final = state.reveal.final === true;
          state.reveal = null;
          if (final) {
            // The application step comes before the result (once per run).
            state.applyStep = { sel: null, answer: null, needsPick: false, tapped: null, continueReq: false };
            state.leftWasDown = keys.has('arrowleft') || keys.has('a') || keys.has('keya');
            state.rightWasDown = keys.has('arrowright') || keys.has('d') || keys.has('keyd');
          }
        }
        return;
      }

      // ── Choice modal (pause) — 2 options, ←/→ select, ENTER commit ──
      if (state.choice) {
        state.timerPaused = true;
        state.actionPrompt = null;
        const left = keys.has('arrowleft') || keys.has('a') || keys.has('keya');
        const right = keys.has('arrowright') || keys.has('d') || keys.has('keyd');
        // Positions, not meanings: left box = 0, right box = 1. A NEW press is
        // needed (an arrow still held from walking does not select: see the open below).
        if (left && !state.leftWasDown) state.choice.sel = 0;
        if (right && !state.rightWasDown) state.choice.sel = 1;
        state.leftWasDown = left;
        state.rightWasDown = right;
        if (state.choice.sel === 0 || state.choice.sel === 1) state.choice.needsPick = false;

        if (isEnterJustPressed(keys, state)) {
          // Nothing is preselected; confirming without a pick only says so.
          // (index 0 is a valid pick — compare with null, never with falsiness)
          if (state.choice.sel !== 0 && state.choice.sel !== 1) {
            state.choice.needsPick = true;
            return;
          }
          const con = state.consoles.find((c) => c.key === state.choice.consoleKey);
          const opt = con.options[state.choice.sel];
          const before = state.transgressedCount;
          const boundariesBefore = state.boundaries;
          state.boundaries = applyChoice(state.boundaries, opt.effects);
          const after = countTransgressed(state.boundaries);
          state.transgressedCount = after;
          con.chosen = true;
          state.choicesMade++;
          state.choice = null;
          state.ringPulse = 0.6;

          const recovered = before - after; // + good / − bad
          const feedback = summarizePlanetaryChoice(before, after, state.boundaries.length);
          const feedbackTemplate = {
            improved: L.feedbackImproved,
            unchanged: L.feedbackUnchanged,
            caution: L.feedbackCaution,
          }[feedback.tone];
          // The old «Affects» line, now AFTER the answer and split by direction
          // (game model, labelled «in the game»).
          const fx = choiceEffectChanges(boundariesBefore, state.boundaries); // real before/after (F1)
          const shortOf = (k) => state.boundaries.find((b) => b.key === k)?.short || k;
          const effectLines = [
            fx.better.length ? L.effectsBetter.replace('__L__', fx.better.map(shortOf).join(' · ')) : null,
            fx.worse.length ? L.effectsWorse.replace('__L__', fx.worse.map(shortOf).join(' · ')) : null,
          ].filter(Boolean);
          state.choiceFeedback = {
            tone: feedback.tone,
            timer: effectLines.length ? 4.5 : 2.8,
            effectLines,
            text: feedbackTemplate
              .replace('__B__', feedback.beforeSafe)
              .replace('__A__', feedback.afterSafe),
          };
          // The live score mirrors the current number of recovered safe limits, so a
          // better final planetary state always means a better final score. A worsening
          // choice still avoids punitive red ✗/shake; the amber feedback explains it.
          const previousScore = planetaryScoreForTransgressed(before, state.boundaries.length);
          const nextScore = planetaryScoreForTransgressed(after, state.boundaries.length);
          helpers.setScore(nextScore);
          const cpx = state.ringCenterPx;
          if (recovered > 0) {
            spawnSparkles(state, cpx.x, cpx.y, '#3f9b6d', 14);
            spawnFloatingText(state, cpx.x, cpx.y - 40, `+${nextScore - previousScore}`, '#3f9b6d');
          } else if (recovered < 0) {
            spawnSparkles(state, cpx.x, cpx.y, '#FFB74D', 10); // amber pulse, not alarm-red
          }

          // Reveal: final → win; else the option's beat once; a worsening choice forces 'crossing'.
          // Card body = OUR plain sentence, translated; `paraphrase` keeps the
          // Stockholm verbatim behind the badge instead of in front of a nine-year-old.
          const say = (key) => ({
            quote: (L.facts && L.facts[key]) || PB_REVEALS[key].plain,
            sourceId: PB_REVEALS[key].sourceId,
            paraphrase: true,
          });
          const final = state.choicesMade >= state.consoles.length;
          if (final) {
            // "Back inside the safe space!" is a reward line, so it only fires on a run that
            // actually got back inside. A child ending on 8 of 9 transgressed used to be
            // congratulated and then shown the failure screen (fixed 2026-08-06).
            const { passed } = gradePlanetaryBoundaries({
              transgressed: countTransgressed(state.boundaries),
            });
            state.reveal = passed
              ? { ...say('win'), lead: L.winToon, final: true }
              : { ...say('crossing'), lead: L.loseToon, tone: 'warning', final: true };
          } else {
            const key = recovered < 0 ? 'crossing' : opt.revealKey;
            if (!state.shownReveals.has(key)) {
              state.shownReveals.add(key);
              // The lose line belongs to a choice that actually made things WORSE. It used to
              // fire on every 'crossing' card, and all four high-impact options carry that key
              // unconditionally, so it appeared when nothing had been breached at all.
              const worse = recovered < 0;
              state.reveal = {
                ...say(key),
                lead: worse ? L.loseToon : undefined,
                tone: worse ? 'warning' : undefined,
              };
            }
          }
        }
        return;
      }

      state.timerPaused = false;
      if (state.irisOpenness < 1) return;

      // ── Walk + open a console ──
      updatePlayerMovement(state.player, dt, keys, isWalkable);
      const con = state.consoles.find((c) => !c.chosen && checkInteraction(state.player, c.tiles, 1));
      state.facingConsoleKey = con ? con.key : null;
      state.actionPrompt = con ? L.consoleTemplate.replace('__D__', con.label) : null;

      if (isEnterJustPressed(keys, state) && con) {
        // No option preselected. An arrow already held while walking
        // counts as «down», so only a NEW press selects.
        state.choice = { consoleKey: con.key, sel: null, needsPick: false };
        state.leftWasDown = keys.has('arrowleft') || keys.has('a') || keys.has('keya');
        state.rightWasDown = keys.has('arrowright') || keys.has('d') || keys.has('keyd');
      }
    },

    render: (ctx, state) => {
      if (!atlasRef.current) return;

      ctx.fillStyle = '#16213a';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      applyRoomCamera(ctx, ROOM);
      renderGameRoomTiles(ctx, ROOM.map, atlasRef.current);
      renderMissionControlDeck(ctx, state);
      renderPlanetaryObservationLab(ctx, state);
      renderGameRoomDecorations(ctx, ROOM);
      renderBoundaryRing(ctx, state);
      renderConsoles(ctx, state);
      renderGameRoomPlayer(ctx, state, atlasRef.current);
      renderParticles(ctx, state);
      renderFloatingTexts(ctx, state);
      renderRejectX(ctx, state);
      releaseRoomCamera(ctx);

      renderActionPrompt(ctx, state);
      renderChoiceModal(ctx, state);
      renderRevealCard(ctx, state);
      renderChoiceFeedback(ctx, state);

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

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  useEffect(() => {
    let frameId;
    const syncHeader = () => {
      const state = stateRef.current;
      if (state?.boundaries) {
        const next = {
          decisions: state.choicesMade || 0,
          stars: planetaryStarsForTransgressed(countTransgressed(state.boundaries)),
        };
        setHeaderProgress((current) => (
          current.decisions === next.decisions && current.stars === next.stars ? current : next
        ));
      }
      // Mirror the application step for the DOM card (hidden behind the
      // intro / instructions card and the exit confirm).
      const a = state?.applyStep && !state.showMissionIntro && !state.exitConfirmOpen
        ? { sel: state.applyStep.sel, answer: state.applyStep.answer, needsPick: !!state.applyStep.needsPick }
        : null;
      setApplyView((cur) => (JSON.stringify(cur) === JSON.stringify(a) ? cur : a));
      frameId = requestAnimationFrame(syncHeader);
    };
    frameId = requestAnimationFrame(syncHeader);
    return () => cancelAnimationFrame(frameId);
  }, [stateRef]);

  // Completion → ResultScreen (source panel wired via MISSION_SOURCES.PlanetaryBoundaries).
  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const s = stateRef.current;
      const transgressed = countTransgressed(s.boundaries || []);
      const total = s.boundaries?.length || 9;
      const { passed, tier } = gradePlanetaryBoundaries({ transgressed });
      setTimeout(() => onComplete(score, passed, {
        tier, transgressed, safe: total - transgressed, total,
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
      // Mid-game reveal card chip — renderRevealCard writes {x,y,w,h}.
      if (!state.reveal || !state.sourceBadgeRect || !state.reveal.sourceId) return;
      const r = state.sourceBadgeRect;
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        window.open('/source.html?src=' + state.reveal.sourceId, '_blank', 'noopener');
      }
    };
    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [atlasReady]);

  // Source open via keyboard: press S while the intro card or a reveal is open. Listens
  // on WINDOW (like the main key handler, useGameRoomCanvas.js:59) so it survives the
  // canvas losing focus after a header-button click (FIX-F). Real keydown handler (not the
  // RAF loop) so window.open counts as a user gesture; the loop is paused during
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
        return;
      }
      if (state.applyStep && state.applyStep.answer !== null && !state.showMissionIntro && !state.exitConfirmOpen
        && gameStateRef.current === 'PLAYING') {
        window.open('/source.html?src=' + PB_APPLY.sourceId, '_blank', 'noopener');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#16213a', overflow: 'hidden' }}>
      <ScoreBar
        score={score}
        stars={headerProgress.stars}
        timeLeft={null}
        headerStatus={(
          <span data-testid="planetary-decision-progress" style={{ color: '#FFF8E1', fontSize: 16, fontWeight: 700 }}>
            {t('planetary.header_progress', { current: headerProgress.decisions, total: PB_CONSOLES.length })}
          </span>
        )}
        onPause={() => { const s = stateRef.current; if (s?.applyStep) s.applyStep.needRelease = true; setGameState('PAUSED'); }}
        onInstructions={() => initMissionIntro(stateRef.current, t, missionIntroFor(t))}
        onExit={() => onNavigate('hub')}
        onFreeze={(f) => { const s = stateRef.current; if (s) { s.exitConfirmOpen = f; if (s.applyStep) s.applyStep.needRelease = true; } }}
      />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
        {applyView && gameState === 'PLAYING' && (
          <PlanetaryApplyStep
            view={applyView}
            t={t}
            onPick={(i) => { const s = stateRef.current; if (s?.applyStep && s.applyStep.answer === null) s.applyStep.tapped = i; }}
            onContinue={() => { const s = stateRef.current; if (s?.applyStep) s.applyStep.continueReq = true; }}
            canvasRef={canvasRef}
          />
        )}
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
          background: '#16213a', color: '#9fc3e8', fontSize: 24,
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

// ── The application step, a DOM card over the canvas ──
// A page-level card (like the Spot the Fake inspector), not canvas drawing: it stays legible
// at 844×390 and, as a blocking overlay, hides the touch D-pad/A/B so they never sit on it.
// Options and Continue are real buttons (tap / click); the keyboard keeps going through the
// game loop (←/→, Enter/Space), so the buttons never take focus away from the canvas.
// Sized in CANVAS units (like the canvas cards: card 760 wide, question 20, text 15, hint 13),
// multiplied by --k = the canvas CSS scale, so it matches the other cards at every window size.
// On small screens the canvas scale would make the text unreadable (844×390 → ×0.47), so --k
// never drops below APPLY_MIN_K (body text ≥ 13 CSS px) — the reason this card is DOM at all.
const APPLY_MIN_K = 13 / 15;
const u = (n) => `calc(${n} * var(--k, 1) * 1px)`;
const APPLY_CSS = `
.pb-apply{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.62);padding:${u(8)};box-sizing:border-box}
.pb-apply *{box-sizing:border-box}
.pb-apply-card{width:min(${u(760)},100%);max-height:100%;overflow:auto;background:#FFF8E1;border:${u(2)} solid #5D4037;
  border-radius:${u(20)};box-shadow:0 8px 30px rgba(0,0,0,.45);display:flex;flex-direction:column;
  font-family:'Inter',system-ui,sans-serif;padding:${u(8)}}
.pb-apply-head{background:#4F8D2D;color:#fff;padding:${u(8)} ${u(16)};border-radius:${u(14)}}
.pb-apply-kicker{font-size:${u(12)};font-weight:700;opacity:.92}
.pb-apply-title{font:800 ${u(20)} 'Fredoka','Inter',system-ui,sans-serif}
.pb-apply-body{padding:${u(12)} ${u(16)} ${u(8)};display:flex;flex-direction:column;gap:${u(10)};color:#3E2723}
.pb-apply-ctx{font-size:${u(14)};font-style:italic;color:#5D4037}
.pb-apply-q{font-size:${u(17)};font-weight:800;line-height:1.3}
.pb-apply-opts{display:flex;gap:${u(20)}}
.pb-apply-opt{flex:1;text-align:left;cursor:pointer;border:${u(1.5)} solid #B89B7A;border-radius:${u(16)};background:#FFFDF7;
  padding:${u(12)} ${u(14)};font:inherit;color:#4E342E}
.pb-apply-opt.sel{border:${u(4)} solid #2F6FBE;background:#E7F1FF;padding:${u(9.5)} ${u(11.5)}}
.pb-apply-ol{font-size:${u(14)};font-weight:800;color:#5D4037;margin-bottom:${u(6)}}
.pb-apply-opt.sel .pb-apply-ol{color:#174F91}
.pb-apply-ot{font-size:${u(15)};line-height:1.33}
.pb-apply-hint{align-self:center;background:#F3E4C7;border-radius:${u(14)};padding:${u(6)} ${u(18)};font-size:${u(13)};font-weight:700;color:#5D4037;text-align:center}
.pb-apply-hint.warn{background:#FFE0B2;border:1px solid #E65100;color:#BF360C}
.pb-apply-you{font-size:${u(14)}}
.pb-apply-fb{border-radius:${u(14)};padding:${u(10)} ${u(14)}}
.pb-apply-fb.ok{background:#E5F4DD;border:${u(2)} solid #4F8D2D}
.pb-apply-fb.info{background:#FFF0CC;border:${u(2)} solid #D28A1C}
.pb-apply-fh{font-weight:800;font-size:${u(16)};margin-bottom:${u(4)}}
.pb-apply-fx{font-size:${u(15)};line-height:1.4}
.pb-apply-foot{display:flex;justify-content:space-between;align-items:flex-end;gap:${u(12)}}
.pb-apply-src{cursor:pointer;background:#FDE9B0;border:1px solid #D28A1C;border-radius:${u(10)};padding:${u(3)} ${u(10)};font:800 ${u(12)} 'Inter',system-ui,sans-serif;color:#3E2723}
.pb-apply-sh{font-size:${u(10)};color:#6B5A48;margin-top:${u(2)}}
.pb-apply-go{cursor:pointer;background:#4F8D2D;color:#fff;border:0;border-radius:${u(10)};padding:${u(7)} ${u(16)};font:800 ${u(14)} 'Inter',system-ui,sans-serif}
`;

const keepCanvasFocus = (e) => e.preventDefault();

function PlanetaryApplyStep({ view, t, onPick, onContinue, canvasRef }) {
  useBlockingCanvasOverlay();
  const rootRef = useRef(null);
  useLayoutEffect(() => {
    const canvas = canvasRef?.current;
    const root = rootRef.current;
    if (!canvas || !root) return undefined;
    const apply = () => {
      const w = canvas.getBoundingClientRect().width;
      const k = Math.max(w > 0 ? w / CANVAS_W : 1, APPLY_MIN_K);
      root.style.setProperty('--k', String(k));
      root.dataset.k = k.toFixed(3);
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(canvas);
    window.addEventListener('resize', apply);
    return () => { ro?.disconnect(); window.removeEventListener('resize', apply); };
  }, [canvasRef]);
  const opts = PB_APPLY.options; // ['keep', 'share'] — left, right
  const label = (i) => `${i === 0 ? '←' : '→'} ${t('planetary.option_label', { letter: i === 0 ? 'A' : 'B' })}`;
  const answered = view.answer === 0 || view.answer === 1;
  const right = answered && opts[view.answer] === PB_APPLY.answer;
  const source = SOURCES[PB_APPLY.sourceId];
  const openSource = () => window.open('/source.html?src=' + PB_APPLY.sourceId, '_blank', 'noopener');
  return (
    <div ref={rootRef} className="pb-apply" data-testid="pb-apply" role="dialog" aria-modal="true" aria-labelledby="pb-apply-title">
      <style>{APPLY_CSS}</style>
      <div className="pb-apply-card" data-testid="pb-apply-card">
        <div className="pb-apply-head">
          <div className="pb-apply-kicker">{t('planetary.apply.kicker')}</div>
          <div className="pb-apply-title" id="pb-apply-title">{t('planetary.apply.title')}</div>
        </div>
        <div className="pb-apply-body">
          {!answered && <div className="pb-apply-ctx" data-testid="pb-apply-context">{t('planetary.apply.context')}</div>}
          <div className="pb-apply-q" data-testid="pb-apply-question">{t('planetary.apply.question')}</div>
          {!answered && (
            <>
              <div className="pb-apply-opts">
                {opts.map((o, i) => (
                  <button
                    key={o}
                    type="button"
                    tabIndex={-1}
                    data-testid={`pb-apply-opt-${i}`}
                    data-option={o}
                    aria-pressed={view.sel === i}
                    className={`pb-apply-opt${view.sel === i ? ' sel' : ''}`}
                    onPointerDown={keepCanvasFocus}
                    onClick={() => onPick(i)}
                  >
                    <div className="pb-apply-ol">{label(i)}</div>
                    <div className="pb-apply-ot">{t(`planetary.apply.opt_${o}`)}</div>
                  </button>
                ))}
              </div>
              <div className={`pb-apply-hint${view.needsPick ? ' warn' : ''}`} data-testid="pb-apply-hint">
                {view.needsPick ? t('planetary.choose_first') : t('planetary.apply.hint')}
              </div>
            </>
          )}
          {answered && (
            <>
              <div className="pb-apply-you" data-testid="pb-apply-you">
                {t('planetary.apply.you')} <b>{t(`planetary.apply.opt_${opts[view.answer]}`)}</b>
              </div>
              <div className={`pb-apply-fb ${right ? 'ok' : 'info'}`} data-testid="pb-apply-feedback" data-right={right ? '1' : '0'}>
                <div className="pb-apply-fh">{t(right ? 'planetary.apply.right_head' : 'planetary.apply.other_head')}</div>
                <div className="pb-apply-fx">
                  {right ? t('planetary.apply.explain') : `${t('planetary.apply.other_prefix')} ${t('planetary.apply.explain')}`}
                </div>
              </div>
              <div className="pb-apply-foot">
                <div>
                  <button type="button" tabIndex={-1} className="pb-apply-src" data-testid="pb-apply-source"
                    onPointerDown={keepCanvasFocus} onClick={openSource}>
                    📚 {source?.title || PB_APPLY.sourceId}
                  </button>
                  <div className="pb-apply-sh">{t('planetary.source_hint')}</div>
                </div>
                <button type="button" tabIndex={-1} className="pb-apply-go" data-testid="pb-apply-continue"
                  onPointerDown={keepCanvasFocus} onClick={onContinue}>
                  {t('planetary.apply.continue')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
