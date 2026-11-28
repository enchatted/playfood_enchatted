import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAtlas, TILE } from '../../overworld/tileAtlas.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { playSound } from '../../utils/sound.js';
import useGameStore from '../../store/gameStore.js';
import useGameRoomCanvas from '../hooks/useGameRoomCanvas.js';
import { GAME_ROOMS } from '../engine/gameRoomData.js';
import {
  updatePlayerMovement, isEnterJustPressed, checkInteraction, TILE_SIZE as TS, DIR,
} from '../engine/gameRoomLogic.js';
import {
  renderGameRoomTiles, renderGameRoomPlayer,
  renderGameRoomDecorations, renderHeldItem, renderActionPrompt,
  spawnSparkles, spawnFloatingText, spawnRejectX,
  updateParticles, renderParticles, updateFloatingTexts, renderFloatingTexts,
  updateRejectX, renderRejectX, OX, OY,
  applyRoomCamera, releaseRoomCamera, roomToCanvas,
  initMissionIntro, renderMissionIntroCard,
} from '../engine/gameRoomRenderer.js';
import {
  renderAilingPlots, renderRemedyStations, renderDiagnosisCard, renderSoilMeter,
  renderSoilAmbient, renderObjectiveHUD, renderGuideBanner,
} from '../engine/soilDoctorRenderer.js';
import { renderRevealCard, addGrowAnim, updateGrowAnims, renderGrowAnims } from '../engine/whereDoesItGrowRenderer.js'; // reuse generic source-reveal card + seed→sprout heal pop
import { missionIntroSourceId } from '../engine/missionIntroLogic.js';
import { drawIrisWipe, IRIS_DURATION, getCanvasPointer } from '../../utils/canvas.js';
import { WORLD_ART } from '../../styles/brandColors.js';
import {
  REMEDIES, SOIL_REVEALS, buildSoilPlots, gradeSoilDoctor, liveStarsForSoilState,
  SOIL_START_HEALTH, SOIL_PENALTY_WRONG, SOIL_PENALTY_CHEMICAL, SOIL_POINTS_HEAL, SOIL_POINTS_STUDY,
} from '../../data/growing.js';
import ScoreBar from '../../components/ScoreBar.jsx';
import PauseOverlay from '../../components/PauseOverlay.jsx';
import { dropSoilRemedy } from './soilDoctorCarry.js';

/**
 * SoilDoctor — Growing Our Own Food, Mission 3 (CHALLENGE).
 *
 * Diagnose 4 ailing garden plots and treat each with the right NATURAL remedy
 * (mulch / compost / cover crops / no-till). The chemical shortcut is a trap:
 * it poisons the soil. A shared soil-health meter can crash → real fail state.
 * Synthesis (symptom→cause→remedy), dilemma (resist the chemical), trade-off
 * (soil-health budget). Heal all 4 → ResultScreen with the 3-source panel.
 */

const ROOM = GAME_ROOMS.SoilDoctor;
const REMEDY_EMOJI = Object.fromEntries(REMEDIES.map((r) => [r.key, r.emoji]));

// Shared MissionIntroCard. The fact REUSES the locked 🟢 SOIL_REVEALS.intro
// verbatim; title/steps/goal are free UI text. The old intro `lead` (guardian
// framing) becomes free step/goal text — no fact wording lost.
const MISSION_INTRO = {
  titleKey: 'missionIntro.soildoctor.title',
  stepKeys: [
    'missionIntro.soildoctor.step1',
    'missionIntro.soildoctor.step2',
    'missionIntro.soildoctor.step3',
    'missionIntro.soildoctor.step4', // How the stars are earned
  ],
  introFact: SOIL_REVEALS.intro,
  goalKey: 'missionIntro.soildoctor.goal',
  ctaKey: 'hint.skip_ab',
};

// Custom walkability (GardenPlanner / WhereDoesItGrow pattern): grass is walkable.
const GARDEN_WALKABLE = new Set([TILE.GRASS, TILE.DARK_GRASS, TILE.PATH, TILE.FLOOR_STONE]);
// Block the plot + station overlay tiles so the player stands BESIDE them (and
// interacts), instead of walking on top — that "one tile too far" trap made Enter
// silently do nothing and let the sprite cover the station labels.
const BLOCKED_TILES = new Set([
  ...ROOM.remedyStations.flatMap((s) => s.tiles.map((t) => `${t.col},${t.row}`)),
  ...ROOM.ailingPlots.flatMap((p) => p.tiles.map((t) => `${t.col},${t.row}`)),
]);
const isWalkable = (col, row) => {
  if (col < 0 || col >= 20 || row < 0 || row >= 15) return false;
  if (BLOCKED_TILES.has(`${col},${row}`)) return false;
  return GARDEN_WALKABLE.has(ROOM.map[row][col]);
};

export default function SoilDoctor({ island, mission, missionId, onComplete, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const atlasRef = useRef(null);
  const [atlasReady, setAtlasReady] = useState(false);
  const [liveStars, setLiveStars] = useState(3);

  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  // Pre-translate everything used inside the (non-React) game loop.
  const i18nRef = useRef({});
  i18nRef.current = {
    sourceHint: t('soildoctor.source_hint'),
    diagnosePrompt: t('soildoctor.diagnose_prompt'),
    pickupTemplate: t('soildoctor.pickup_prompt', { remedy: '__R__' }),
    treatTemplate: t('soildoctor.treat_prompt', { remedy: '__R__' }),
    soilHealth: t('soildoctor.soil_health'),
    diagnosisTitle: t('soildoctor.diagnosis_title'),
    remedy: {
      mulch: t('soildoctor.remedy_mulch'),
      compost: t('soildoctor.remedy_compost'),
      cover: t('soildoctor.remedy_cover'),
      notill: t('soildoctor.remedy_notill'),
      chemical: t('soildoctor.remedy_chemical'),
    },
    remedyEffect: {
      mulch: t('soildoctor.remedy_effect_mulch'),
      compost: t('soildoctor.remedy_effect_compost'),
      cover: t('soildoctor.remedy_effect_cover'),
      notill: t('soildoctor.remedy_effect_notill'),
      chemical: t('soildoctor.remedy_effect_chemical'),
    },
    symptom: {
      eroding: t('soildoctor.symptom_eroding'),
      spent: t('soildoctor.symptom_spent'),
      compacted: t('soildoctor.symptom_compacted'),
      lifeless: t('soildoctor.symptom_lifeless'),
    },
    need: {
      eroding: t('soildoctor.need_eroding'),
      spent: t('soildoctor.need_spent'),
      compacted: t('soildoctor.need_compacted'),
      lifeless: t('soildoctor.need_lifeless'),
    },
    guide: {
      inspect: t('soildoctor.guide_inspect'),
      grab: t('soildoctor.guide_grab'),
      treat: t('soildoctor.guide_treat'),
    },
    revealTitle: t('soildoctor.reveal_title'),
    revealDismiss: t('soildoctor.reveal_dismiss'),
    healed: t('soildoctor.healed'),
    // The cause-and-effect line every heal card ends on.
    soilChain: t('soildoctor.soil_chain'),
    poisoned: t('soildoctor.poisoned'),
    wrong: t('soildoctor.wrong'),
    warnChemicalTitle: t('soildoctor.warn_chemical_title'),
    warnFailTitle: t('soildoctor.warn_fail_title'),
    // The card shows the child-facing plain sentence, translated;
    // Press S still opens the verbatim source. EN falls back via defaultValue to the
    // canonical SOIL_REVEALS.plain (en.json has no soildoctor.facts).
    soilFacts: Object.fromEntries(
      Object.entries(SOIL_REVEALS).map(([id, r]) => [
        id, t('soildoctor.facts.' + id, { defaultValue: r.plain }),
      ])
    ),
  };

  // Inject the translated intro fact so the card shows it in the child's language while
  // Press-S still opens the EN source. Rebuilt each render like the rest of i18nRef.
  const missionIntroRef = useRef(MISSION_INTRO);
  missionIntroRef.current = {
    ...MISSION_INTRO,
    introFact: { ...MISSION_INTRO.introFact, quote: i18nRef.current.soilFacts.intro, paraphrase: true },
  };

  const { gameState, setGameState, score, stateRef } = useGameRoomCanvas(canvasRef, {
    timeLimit: null, // CHALLENGE — no clock; the dilemma is strategic, not timed
    // Score floors at 0 like every other game (partner decision 14.07: a child
    // never sees a negative number). Penalties still cost soil health and the
    // fail state still fires; passing was always count-based, not score-based.

    setup: (state) => {
      if (canvasRef.current) canvasRef.current._stateRef = stateRef;
      if (state.player) return;
      const labels = i18nRef.current;
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

      state.plots = buildSoilPlots().map((p, i) => ({
        ...p,
        tiles: ROOM.ailingPlots[i].tiles,
        symptom: labels.symptom[p.id],
        need: labels.need[p.id], // shown on diagnosis — bridges symptom → the right remedy
      }));
      state.stations = ROOM.remedyStations.map((s) => ({
        key: s.key,
        tiles: s.tiles,
        emoji: REMEDY_EMOJI[s.key],
        label: labels.remedy[s.key],
        effect: labels.remedyEffect[s.key], // one-word benefit shown under the name
      }));

      state.carrying = null;
      state.heldItem = null;
      state.soilHealth = SOIL_START_HEALTH;
      state.healedCount = 0;
      state.mistakes = 0;
      state.chemicalUses = 0;
      state.liveStars = 3;

      state.particles = [];
      state.floatingTexts = [];
      state.rejectX = null;
      state.screenShake = 0;
      state.screenShakeAmount = 0;
      state.hintPlotId = null;
      state.hintTimer = 0;
      state.hintStationKey = null; // glow the correct station after repeated misses
      state.hintStationTimer = 0;
      state.pendingReveal = null;  // heal reveal is delayed so the sparkles are seen
      state.pendingRevealTimer = 0;
      // Guide critter (eased toward the nearest sick plot in update) + attract target.
      state.attractPlotId = null;
      state.guideBug = { x: OX + start.col * TS + TS / 2, y: OY + (start.row - 1) * TS, vx: 0 };
      state.guideStep = 'inspect';     // worded onboarding banner: inspect → grab → treat
      state.guideStationKey = null;    // station the bug points to during the 'grab' step
      state.guideLabels = labels.guide;
      state.diagnosisCard = null;
      state.actionPrompt = null;

      state.soilHealthLabel = labels.soilHealth;
      state.diagnosisTitle = labels.diagnosisTitle;
      state.revealTitle = labels.revealTitle;
      state.revealDismiss = labels.revealDismiss;
      state.sourceHint = labels.sourceHint; // localized "press S / tap to open source"

      // Intro — shared MissionIntroCard (frames the doctor loop) with the 🟢 stakes fact.
      // Mid-game heal/chemical/fail/win reveals still use state.reveal (untouched).
      initMissionIntro(state, t, missionIntroRef.current);
    },

    update: (state, dt, keys, helpers) => {
      state.time += dt;

      // Live star bar ("keep your 3 stars") — recomputed each frame, pushed on change.
      {
        const ns = liveStarsForSoilState({
          soilHealth: state.soilHealth,
          chemicalUses: state.chemicalUses || 0,
          mistakes: state.mistakes || 0,
        });
        if (ns !== state.liveStars) { state.liveStars = ns; setLiveStars(ns); }
      }

      if (state.irisOpenness < 1) {
        state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
      }

      updateParticles(state, dt);
      updateFloatingTexts(state, dt);
      updateRejectX(state, dt);
      updateGrowAnims(state, dt);

      if (state.screenShakeAmount > 0.5) {
        state.screenShake = Math.sin(state.time * 50) * state.screenShakeAmount;
        state.screenShakeAmount *= 0.88;
      } else {
        state.screenShake = 0;
        state.screenShakeAmount = 0;
      }

      if (state.hintTimer > 0) {
        state.hintTimer -= dt;
        if (state.hintTimer <= 0) state.hintPlotId = null;
      }
      if (state.hintStationTimer > 0) {
        state.hintStationTimer -= dt;
        if (state.hintStationTimer <= 0) state.hintStationKey = null;
      }
      // Heal celebration beat: let the sparkles/“+25” play, then raise the reveal card.
      if (state.pendingRevealTimer > 0) {
        state.pendingRevealTimer -= dt;
        if (state.pendingRevealTimer <= 0 && state.pendingReveal) {
          state.reveal = state.pendingReveal;
          state.pendingReveal = null;
        }
      }

      // Keep the carried-remedy emoji in sync for renderHeldItem.
      if (dropSoilRemedy(state, keys)) return;
      state.heldItem = state.carrying ? { emoji: REMEDY_EMOJI[state.carrying] } : null;

      // ── MissionIntroCard (pause). Shown once at start; iris opens
      // behind it (advanced at the top of update). ENTER dismisses; S/click opens source.
      if (state.showMissionIntro) {
        state.timerPaused = true;
        state.actionPrompt = null;
        if (isEnterJustPressed(keys, state)) state.showMissionIntro = false;
        return;
      }

      // ── Modals (pause the loop) ──
      if (state.reveal) {
        state.timerPaused = true;
        state.actionPrompt = null;
        if (isEnterJustPressed(keys, state)) {
          const { final, queueWin } = state.reveal;
          state.reveal = null;
          if (queueWin) {
            // The fourth plot's own remedy fact was just read — now the win beat.
            // (It used to REPLACE that fact, so one remedy lesson was silently
            // lost every run; decision 06.08, same as SpotTheFake's win card.)
            state.reveal = {
              quote: i18nRef.current.soilFacts.win,
              sourceId: SOIL_REVEALS.win.sourceId,
              final: true,
              paraphrase: true,
            };
          } else if (final === true) {
            helpers.complete();
          }
        }
        return;
      }
      if (state.diagnosisCard) {
        state.timerPaused = true;
        state.actionPrompt = null;
        if (isEnterJustPressed(keys, state)) {
          const masked = state.diagnosisCard.maskedReveal;
          state.diagnosisCard = null;
          // Reveal the "looks healthy but isn't" fact right after diagnosing the masked plot.
          if (masked) state.reveal = { quote: i18nRef.current.soilFacts.masked, sourceId: SOIL_REVEALS.masked.sourceId, paraphrase: true };
        }
        return;
      }
      state.timerPaused = false;

      if (state.irisOpenness < 1) return;

      updatePlayerMovement(state.player, dt, keys, isWalkable);

      // Guided first cure: narrate the doctor loop (examine → fetch remedy → treat)
      // and point the guide bug at the right target, until the first heal lands.
      // After that the bug just wanders and no banner shows.
      {
        const onboarding = state.healedCount === 0;
        const diagnosed = state.plots.find((p) => p.diagnosed && !p.healed);
        let step = null;
        if (onboarding) {
          if (state.carrying) step = 'treat';
          else if (diagnosed) step = 'grab';
          else step = 'inspect';
        }
        state.guideStep = step;
        state.attractPlotId = null;
        state.guideStationKey = null;
        let target = null;

        const nearestSickPlot = (preferKey) => {
          let best = null, bestD = Infinity;
          for (const pp of state.plots) {
            if (pp.healed) continue;
            if (pp.masked && !pp.diagnosed) continue; // keep the lush trap a secret
            if (preferKey && pp.neededRemedy !== preferKey) continue;
            const tl = pp.tiles[0];
            const d = Math.hypot(tl.col - state.player.col, tl.row - state.player.row);
            if (d < bestD) { bestD = d; best = pp; }
          }
          return best;
        };
        const tileTarget = (tiles) => ({ x: OX + tiles[0].col * TS + TS, y: OY + (tiles[0].row + 1) * TS + TS / 2 });

        if (step === 'inspect') {
          const best = nearestSickPlot();
          if (best) { state.attractPlotId = best.id; target = tileTarget(best.tiles); }
        } else if (step === 'grab') {
          // Point at the station the diagnosed plot needs (renderer glows it).
          const st = state.stations.find((s) => s.key === diagnosed.neededRemedy);
          if (st) { state.guideStationKey = st.key; target = tileTarget(st.tiles); }
        } else if (step === 'treat') {
          // Lead back to the plot that matches the carried remedy (else nearest).
          const best = nearestSickPlot(state.carrying) || nearestSickPlot();
          if (best) { state.attractPlotId = best.id; target = tileTarget(best.tiles); }
        }

        const gb = state.guideBug;
        if (gb) {
          const tx = target ? target.x : OX + (10 + Math.sin(state.time * 0.3) * 6) * TS;
          const ty = target ? target.y : OY + (10.5 + Math.cos(state.time * 0.23) * 1.5) * TS;
          gb.vx = tx - gb.x;
          const k = Math.min(1, dt * 1.3);
          gb.x += (tx - gb.x) * k;
          gb.y += (ty - gb.y) * k;
        }
      }

      const labels = i18nRef.current;
      const plot = state.plots.find((p) => !p.healed && checkInteraction(state.player, p.tiles, 1));
      const station = state.stations.find((s) => checkInteraction(state.player, s.tiles, 1));

      // Prompt.
      if (state.carrying) {
        const rLabel = labels.remedy[state.carrying];
        if (plot) state.actionPrompt = labels.treatTemplate.replace('__R__', rLabel);
        else if (station) state.actionPrompt = labels.pickupTemplate.replace('__R__', labels.remedy[station.key]);
        else state.actionPrompt = null;
      } else if (station) {
        state.actionPrompt = labels.pickupTemplate.replace('__R__', labels.remedy[station.key]);
      } else if (plot) {
        state.actionPrompt = labels.diagnosePrompt;
      } else {
        state.actionPrompt = null;
      }

      // ── ENTER ──
      if (isEnterJustPressed(keys, state)) {
        if (state.pendingReveal) return; // mid heal-celebration beat — ignore input
        if (station) {
          state.carrying = station.key; // pick up / swap
          playSound('pickup');
          return;
        }
        if (!plot) return;

        if (!state.carrying) {
          // Inspect (optional diagnosis) — symptoms only. Records the diagnosis so
          // a later heal earns the study bonus; surfaces the masked fact on a
          // deceptively-lush plot's first inspection.
          const firstMaskedLook = plot.masked && !plot.maskedShown;
          if (firstMaskedLook) plot.maskedShown = true;
          plot.diagnosed = true;
          state.diagnosisCard = { plotId: plot.id, symptom: plot.symptom, need: plot.need, maskedReveal: firstMaskedLook };
          return;
        }

        // Treat with the carried remedy.
        const remedy = state.carrying;
        const px = OX + state.player.pixelX + TS / 2;
        const py = OY + state.player.pixelY;
        state.carrying = null;

        if (remedy === plot.neededRemedy) {
          // Correct — heal.
          plot.healed = true;
          plot.poisoned = false;
          plot.health = 100;
          state.healedCount++;
          helpers.addScore(SOIL_POINTS_HEAL);
          spawnSparkles(state, px, py, '#4CAF50', 12);
          spawnFloatingText(state, px, py - 16, `${labels.healed} +${SOIL_POINTS_HEAL}`, '#4CAF50');
          // Seed→sprout pop centred on the healed plot — the "soil came back to life" payoff.
          {
            const tA = plot.tiles[0], tB = plot.tiles[plot.tiles.length - 1];
            addGrowAnim(state, OX + ((tA.col + tB.col) / 2 + 0.5) * TS, OY + (tA.row + 0.9) * TS);
          }
          // Soft-gate reward: studying (diagnosing) the plot first earns a bonus.
          if (plot.diagnosed) {
            helpers.addScore(SOIL_POINTS_STUDY);
            spawnFloatingText(state, px, py - 44, `🔍 +${SOIL_POINTS_STUDY}`, '#42A5F5');
          }
          state.hintStationKey = null;
          state.hintStationTimer = 0;

          const final = state.healedCount >= state.plots.length;
          // Every heal shows THAT plot's remedy fact. On the fourth heal the win
          // beat is QUEUED after it (queueWin), not shown instead of it — the old
          // replacement silently cost the child one remedy lesson every run.
          // Delay the card so the heal sparkles are seen first (longer beat at the end).
          // Heal cards carry the localized «healed» line above the plain sentence; the
          // verbatim passage stays behind the source badge on the same card.
          state.pendingReveal = {
            quote: i18nRef.current.soilFacts[remedy],
            sourceId: SOIL_REVEALS[remedy].sourceId,
            lead: labels.healed,
            takeaway: labels.soilChain,
            final: false,
            queueWin: final,
            paraphrase: true,
          };
          state.pendingRevealTimer = final ? 1.4 : 0.7;
        } else if (remedy === 'chemical') {
          // Trap — poison the soil.
          state.chemicalUses++;
          state.soilHealth -= SOIL_PENALTY_CHEMICAL;
          helpers.addScore(-10);
          plot.poisoned = true;
          plot.health = Math.max(0, plot.health - 20);
          state.screenShakeAmount = 6;
          spawnRejectX(state, px, py);
          spawnFloatingText(state, px, py - 34, labels.poisoned, '#EF5350');
          state.hintPlotId = plot.id;
          state.hintTimer = 2.5;
          if (state.soilHealth <= 0) {
            // Soil crashed — closing beat before ResultScreen (no abrupt cut mid-shake).
            state.reveal = { quote: i18nRef.current.soilFacts.fail, sourceId: SOIL_REVEALS.fail.sourceId, final: true, tone: 'warning', title: labels.warnFailTitle, paraphrase: true };
            return;
          }
          state.reveal = { quote: i18nRef.current.soilFacts.chemical, sourceId: SOIL_REVEALS.chemical.sourceId, tone: 'warning', title: labels.warnChemicalTitle, paraphrase: true };
        } else {
          // Wrong natural remedy — soft setback that teaches, not just punishes.
          state.mistakes++;
          state.soilHealth -= SOIL_PENALTY_WRONG;
          helpers.addScore(-5);
          state.screenShakeAmount = 4;
          spawnRejectX(state, px, py);
          spawnFloatingText(state, px, py - 34, labels.wrong, '#FFB74D');
          state.hintPlotId = plot.id;
          state.hintTimer = 2.5;
          plot.misses = (plot.misses || 0) + 1;
          if (state.soilHealth <= 0) {
            state.reveal = { quote: i18nRef.current.soilFacts.fail, sourceId: SOIL_REVEALS.fail.sourceId, final: true, tone: 'warning', title: labels.warnFailTitle, paraphrase: true };
            return;
          }
          // Scaffold (teach, don't just punish): 2nd miss re-opens the diagnosis so
          // the child re-reads the symptom; 3rd+ miss glows the CORRECT station.
          if (plot.misses >= 3) {
            state.hintStationKey = plot.neededRemedy;
            state.hintStationTimer = 3.5;
          } else if (plot.misses >= 2) {
            plot.diagnosed = true;
            state.diagnosisCard = { plotId: plot.id, symptom: plot.symptom, need: plot.need };
          }
        }
      }
    },

    render: (ctx, state) => {
      if (!atlasRef.current) return;

      ctx.fillStyle = WORLD_ART.meadow;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      applyRoomCamera(ctx, ROOM);

      renderGameRoomTiles(ctx, ROOM.map, atlasRef.current);
      renderGameRoomDecorations(ctx, ROOM);
      renderAilingPlots(ctx, state);
      renderSoilAmbient(ctx, state);   // bug + butterfly + grass ABOVE the plots, so the guide critter is never hidden behind a bed
      renderGrowAnims(ctx, state);     // seed→sprout pop draws over the healed plot
      renderRemedyStations(ctx, state);
      renderGameRoomPlayer(ctx, state, atlasRef.current);
      renderHeldItem(ctx, state);
      renderParticles(ctx, state);
      renderFloatingTexts(ctx, state);
      renderRejectX(ctx, state);

      releaseRoomCamera(ctx);

      // HUD elements at original canvas scale
      renderActionPrompt(ctx, state);
      renderSoilMeter(ctx, state);
      renderObjectiveHUD(ctx, state);
      renderGuideBanner(ctx, state);
      renderDiagnosisCard(ctx, state);
      renderRevealCard(ctx, state);

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

  // Completion → ResultScreen (source panel already wired for SoilDoctor).
  useEffect(() => {
    if (gameState === 'COMPLETED') {
      const s = stateRef.current;
      const { passed, stars, tier } = gradeSoilDoctor({
        healedCount: s.healedCount || 0,
        plotCount: s.plots?.length || 4,
        soilHealth: s.soilHealth ?? 0,
        chemicalUses: s.chemicalUses || 0,
        mistakes: s.mistakes || 0,
      });
      // Persist the best ⭐ for the lighthouse Trophy Hall (same bridge as the other games).
      useGameStore.getState().recordStars('growing:SoilDoctor', stars);
      setTimeout(() => onComplete(score, passed, {
        stars, tier, healed: s.healedCount || 0, mistakes: s.mistakes || 0, chemicalUses: s.chemicalUses || 0,
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
  // opens the branded source viewer. Mirrors WhereDoesItGrow.
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: WORLD_ART.meadow, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <ScoreBar
        score={score}
        timeLeft={null}
        stars={liveStars}
        onPause={() => setGameState('PAUSED')}
        onInstructions={() => initMissionIntro(stateRef.current, t, missionIntroRef.current)}
        onExit={() => onNavigate('hub')}
        onFreeze={(f) => { const s = stateRef.current; if (s) s.exitConfirmOpen = f; }}
      />

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          tabIndex={0}
          style={{
            maxHeight: '100%',
            width: '100%',
            height: 'auto',
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            imageRendering: 'pixelated',
            outline: 'none',
            display: 'block',
          }}
        />
      </div>

      {!atlasReady && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: WORLD_ART.meadow, color: '#fff', fontSize: 24,
        }}>
          Loading...
        </div>
      )}

      {gameState === 'PAUSED' && (
        <PauseOverlay
          surfaceRef={canvasRef}
          onResume={() => setGameState('PLAYING')}
          onInstructions={() => initMissionIntro(stateRef.current, t, missionIntroRef.current)}
          onQuit={() => onNavigate('hub')}
        />
      )}
    </div>
  );
}
