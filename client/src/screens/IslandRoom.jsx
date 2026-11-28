import React, { useRef, useEffect, useState } from 'react';
import { keyBelongsToDomTarget } from '../utils/keyOwnership.js';
import { useTranslation } from 'react-i18next';
import useGameStore from '../store/gameStore.js';
import useOverworldCanvas from '../games/hooks/useOverworldCanvas.js';
import { buildAtlas } from '../overworld/tileAtlas.js';
import {
  ROOMS,
  isRoomWalkable,
  getNearbyNPC,
  isOnExitMat,
  isMissionUnlocked,
  isNearMentor,
  nextMissionId,
  resolveAmbientWaypointStop,
} from '../overworld/islandRoomData.js';
import { CANVAS_W, CANVAS_H, TILE_SIZE, MOVE_DURATION, DIR, ISLANDS } from '../overworld/overworldData.js';
import {
  renderRoomBackground, renderRoomTiles, renderRoomDecorations, renderRoomNPCs,
  renderRoomPlayer, renderNPCPrompt, renderExitPrompt, renderRoomHUD,
  renderNPCPreviewItems, renderAmbientNPCs,
  renderGrowingOutdoor, renderLocalMarket, renderCircularNeighborhood, renderFoodwasteKitchen,
  renderMentorNPC, renderMentorPrompt, renderMentorDialog,
  renderRoomVignettes,
  renderCeremony, makeCeremonySparkles, CEREMONY_BURST_SECONDS,
  renderReflectionCard,
  ROOM_SCENE_RECT, applyRoomSceneTransform, projectRoomScenePoint,
} from '../overworld/islandRoomRenderer.js';
import { lerp, drawIrisWipe, IRIS_DURATION, getCanvasPointer } from '../utils/canvas.js';
import { WORLD_ART } from '../styles/brandColors.js';
import { playSound } from '../utils/sound.js';
import { playMusicCue } from '../utils/music.js';
import { classifyGameViewport } from '../utils/touchControls.js';

const AMBIENT_SPEED = 0.22; // seconds per tile (slower than player)
const AMBIENT_PAUSE_MAX = 2.0; // seconds — longest rest at a waypoint
const MENTOR_PORTRAITS = {
  growing: '👩‍🌾',
  local: '🧑‍🌾',
  foodwaste: '👩‍🍳',
  circular: '👩‍🔧',
};
const ISLAND_BACKDROPS = {
  growing: 'linear-gradient(180deg, #8ED1E8 0%, #C5E8CF 55%, #A8D5A2 100%)',
  local: `linear-gradient(180deg, ${WORLD_ART.marketSkyTop} 0%, ${WORLD_ART.marketSkyMid} 50%, ${WORLD_ART.marketSkyLow} 100%)`,
  circular: `linear-gradient(180deg, ${WORLD_ART.oceanShallow} 0%, ${WORLD_ART.recyclingHub} 60%, ${WORLD_ART.grassDeep} 100%)`,
  foodwaste: `linear-gradient(180deg, ${WORLD_ART.panelCream} 0%, ${WORLD_ART.pebbleLight} 62%, ${WORLD_ART.counterWarm} 100%)`,
};

function readIslandViewportProfile() {
  if (typeof window === 'undefined') return 'standard';
  return classifyGameViewport(window.innerWidth, window.innerHeight);
}

function getDedicatedMentorSprites(atlas, island) {
  return {
    growing: atlas?.gardenerMentor,
    local: atlas?.marketKeeper,
    foodwaste: atlas?.kitchenChef,
    circular: atlas?.mechanicMentor,
  }[island] || null;
}

export function getIslandMentorSprites(atlas, island, color) {
  return getDedicatedMentorSprites(atlas, island)
    || atlas?.ambientNPC?.build?.(color)
    || null;
}

export function isDedicatedMentorSprite(atlas, island, sprites) {
  const dedicatedSprites = getDedicatedMentorSprites(atlas, island);
  return Boolean(dedicatedSprites && sprites === dedicatedSprites);
}

function useIslandViewportProfile() {
  const [profile, setProfile] = useState(readIslandViewportProfile);

  useEffect(() => {
    const updateProfile = () => setProfile(readIslandViewportProfile());
    window.addEventListener('resize', updateProfile);
    window.addEventListener('orientationchange', updateProfile);
    return () => {
      window.removeEventListener('resize', updateProfile);
      window.removeEventListener('orientationchange', updateProfile);
    };
  }, []);

  return profile;
}

export default function IslandRoom({ island, onNavigate }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const completedMissions = useGameStore((s) => s.completedMissions);
  const points = useGameStore((s) => s.points);
  const gameStars = useGameStore((s) => s.gameStars);
  const ceremoniesSeen = useGameStore((s) => s.ceremoniesSeen);
  const markCeremonySeen = useGameStore((s) => s.markCeremonySeen);
  const reflectionsSeen = useGameStore((s) => s.reflectionsSeen);
  const markReflectionSeen = useGameStore((s) => s.markReflectionSeen);
  const [atlasReady, setAtlasReady] = useState(false);
  const atlasRef = useRef(null);
  const viewportProfile = useIslandViewportProfile();
  const tabletPortrait = viewportProfile === 'tablet-portrait';

  const room = ROOMS[island];
  const completed = completedMissions[island] || [];
  const totalStars = Object.values(gameStars).reduce((sum, value) => sum + value, 0);
  // Functional defensive fallback — mid-grey for unknown island (never expected to hit)
  const islandColor = ISLANDS[island]?.color || '#666';

  // The next game the child should actually play. Undefined once all three are
  // done, which is fine: nothing is locked then, so no prompt asks for it.
  const nextId = nextMissionId(island, completed);

  // Pre-translate strings for canvas rendering
  const i18nRef = useRef({});
  i18nRef.current = {
    islandName: t(`islands.${island}.name`),
    playPrompt: t('island.play_prompt'),
    exitPrompt: t('island.exit_prompt'),
    backToMap: '← ' + t('result.back_to_map'),
    backHint: t('island.back_hint'),
    missionNames: {
      1: t(`missions.${island}.1`),
      2: t(`missions.${island}.2`),
      3: t(`missions.${island}.3`),
    },
    // Gating: pre-interpolated (the canvas loop cannot call t()).
    // It names the first game still unplayed, never the one directly before the
    // locked NPC. Standing at the third NPC with nothing finished used to read
    // "finish The Little Gardener first", which is itself locked: it sent a
    // child from one shut door to another. Same rule the mentor already uses.
    lockedPrompt: t('island.locked_prompt', {
      mission: t(`missions.${island}.${nextId || 1}`),
    }),
    // Mentor: full per-island strings (no name interpolation: EL needs
    // accusative «την Κηπουρό», nominative «η Κηπουρός», so composing breaks).
    ...(room.mentor && {
      mentorName: t(`island.mentor_name_${island}`),
      mentorPortrait: MENTOR_PORTRAITS[island],
      mentorPrompt: t(`island.mentor_prompt_${island}`),
      dialogContinue: t('island.dialog_continue'),
      mentorStory: t(`island.intro_${island}`, {
        m1: t(`missions.${island}.1`),
        m2: t(`missions.${island}.2`),
        m3: t(`missions.${island}.3`),
      }),
      mentorHints: {
        1: t('island.mentor_hint', { mission: t(`missions.${island}.1`) }),
        2: t('island.mentor_hint', { mission: t(`missions.${island}.2`) }),
        3: t('island.mentor_hint', { mission: t(`missions.${island}.3`) }),
      },
      // Per-island done line, falling back to the shared garden string when an
      // island defines no override (growing/local keep the base mentor_done).
      mentorDone: t([`island.mentor_done_${island}`, 'island.mentor_done']),
    }),
    // Ceremony card: per-island keys, only islands with room.ceremony
    ...(room.ceremony && {
      ceremonyTitle: t(`island.ceremony_title_${island}`),
      ceremonyMsg: t(`island.ceremony_msg_${island}`),
      ceremonyIcon: room.ceremonyIcon,
      dialogContinue: t('island.dialog_continue'),
    }),
    // Reflection prompt: per-island keys, only islands with room.reflection
    ...(room.reflection && {
      reflectionTitle: t(`island.reflection_title_${island}`),
      reflectionQ: t(`island.reflection_q_${island}`),
      reflectionOpts: [
        t(`island.reflection_opt1_${island}`),
        t(`island.reflection_opt2_${island}`),
        t(`island.reflection_opt3_${island}`),
      ],
      reflectionAck: t(`island.reflection_ack_${island}`),
      dialogContinue: t('island.dialog_continue'),
    }),
  };

  // Build tile atlas once
  useEffect(() => {
    atlasRef.current = buildAtlas();
    setAtlasReady(true);
  }, []);

  // Auto-focus canvas
  useEffect(() => {
    if (atlasReady && !tabletPortrait && canvasRef.current) {
      canvasRef.current.focus();
    }
  }, [atlasReady, tabletPortrait]);

  const start = room.playerStart;

  // Room game loop
  const { stateRef } = useOverworldCanvas(canvasRef, {
    setup: (state) => {
      state.player = {
        col: start.col,
        row: start.row,
        pixelX: start.col * TILE_SIZE,
        pixelY: start.row * TILE_SIZE,
        dir: start.dir ?? DIR.UP,
        moving: false,
        moveTimer: 0,
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: 0,
      };

      state.time = 0;
      state.nearNPC = null;
      state.onExit = false;
      state.islandColor = islandColor;
      state.strings = i18nRef.current;
      state.irisOpenness = 0;    // starts closed, opens up
      state.irisClosing = false; // true when exiting room
      state.roomSceneRect = { ...ROOM_SCENE_RECT };
      state.mentorDialogLayout = null;

      // Mentor: prebuilt sprite frames + auto story card before mission 1
      state.nearMentor = false;
      state.mentorSprites = room.mentor
        ? getIslandMentorSprites(atlasRef.current, island, room.mentor.color || '#F48FB1')
        : null;
      state.mentorUsesDedicatedSprite = isDedicatedMentorSprite(
        atlasRef.current,
        island,
        state.mentorSprites,
      );
      state.mentorPortraitSprite = state.mentorUsesDedicatedSprite
        ? state.mentorSprites?.[0] || null
        : null;
      state.mentorDialog = room.mentor && completed.length === 0
        ? { text: i18nRef.current.mentorStory }
        : null;

      // Ceremony: 3/3 just reached and never celebrated → queue it.
      // 'pending' waits for the iris to open so the beat lands on a visible room.
      state.ceremony =
        room.ceremony && completed.length >= 3 && !ceremoniesSeen.includes(island)
          ? { phase: 'pending', t: 0, sparkles: makeCeremonySparkles() }
          : null;

      // Reflection: exactly 2/3 (Hook+Practice done, Challenge not)
      // and never shown before → queue the tap-to-answer card.
      // Mutually exclusive with the ceremony (which needs 3/3).
      state.reflection =
        room.reflection && completed.length === 2 && !reflectionsSeen.includes(island)
          ? { phase: 'ask', selIdx: 0, t: 0 }
          : null;

      // Initialize ambient NPCs
      const ambientDefs = room.ambientNPCs || [];
      state.ambientNPCs = ambientDefs.map((def) => {
        const wp0 = def.waypoints[0];
        const initialStop = wp0.activity
          ? resolveAmbientWaypointStop(wp0, Math.random())
          : null;
        return {
          col: wp0.col,
          row: wp0.row,
          pixelX: wp0.col * TILE_SIZE,
          pixelY: wp0.row * TILE_SIZE,
          dir: 0, // DOWN
          moving: false,
          moveTimer: 0,
          fromX: 0, fromY: 0,
          toX: 0, toY: 0,
          waypointIdx: 0,
          pauseTimer: initialStop?.duration ?? Math.random() * AMBIENT_PAUSE_MAX,
          speed: AMBIENT_SPEED * (0.85 + Math.random() * 0.4), // each villager keeps their own stride
          lookTimer: 0,
          easeStop: false,
          stopFace: initialStop?.face ?? null,
          activity: initialStop?.activity ?? null,
          color: def.color || '#CE93D8',
          waypoints: def.waypoints,
          sprites: atlasRef.current?.ambientNPC?.build?.(def.color || '#CE93D8') || null,
        };
      });
    },

    update: (state, dt, keys) => {
      if (tabletPortrait) {
        keys.clear();
        return;
      }

      state.time += dt;
      state.strings = i18nRef.current;

      // Iris wipe animation
      if (state.irisClosing) {
        state.irisOpenness = Math.max(0, state.irisOpenness - dt / IRIS_DURATION);
      } else if (state.irisOpenness < 1) {
        state.irisOpenness = Math.min(1, state.irisOpenness + dt / IRIS_DURATION);
      }

      // Block input while iris is closing
      if (state.irisClosing) return;

      // The ceremony is modal: room freezes, only its own clock advances
      if (state.ceremony) {
        const c = state.ceremony;
        if (c.phase === 'pending') {
          if (state.irisOpenness >= 1) {
            c.phase = 'burst';
            playMusicCue('milestone');
          }
        } else {
          c.t += dt;
          if (c.phase === 'burst' && c.t >= CEREMONY_BURST_SECONDS) {
            c.phase = 'card';
          }
        }
        return;
      }

      // The reflection card is modal too: only its pop-in clock advances
      // (input arrives via the keydown/click handlers below).
      if (state.reflection) {
        if (state.irisOpenness >= 1) state.reflection.t += dt;
        return;
      }

      // Mentor dialog is modal: freeze the room until Enter dismisses it
      if (state.mentorDialog) return;

      const p = state.player;

      // ─── Movement ───────────────────────────────
      if (p.moving) {
        p.moveTimer += dt;
        const progress = Math.min(p.moveTimer / MOVE_DURATION, 1);
        p.pixelX = lerp(p.fromX, p.toX, progress);
        p.pixelY = lerp(p.fromY, p.toY, progress);

        if (progress >= 1) {
          p.pixelX = p.toX;
          p.pixelY = p.toY;
          p.moving = false;
        }
      }

      if (!p.moving) {
        let dx = 0, dy = 0, dir = p.dir;

        if (keys.has('arrowup') || keys.has('w') || keys.has('keyw')) {
          dy = -1; dir = DIR.UP;
        } else if (keys.has('arrowdown') || keys.has('s') || keys.has('keys')) {
          dy = 1; dir = DIR.DOWN;
        } else if (keys.has('arrowleft') || keys.has('a') || keys.has('keya')) {
          dx = -1; dir = DIR.LEFT;
        } else if (keys.has('arrowright') || keys.has('d') || keys.has('keyd')) {
          dx = 1; dir = DIR.RIGHT;
        }

        if (dx !== 0 || dy !== 0) {
          p.dir = dir;
          const newCol = p.col + dx;
          const newRow = p.row + dy;

          if (isRoomWalkable(room, newCol, newRow)) {
            p.moving = true;
            p.moveTimer = 0;
            p.fromX = p.col * TILE_SIZE;
            p.fromY = p.row * TILE_SIZE;
            p.col = newCol;
            p.row = newRow;
            p.toX = newCol * TILE_SIZE;
            p.toY = newRow * TILE_SIZE;
          }
        }
      }

      // ─── Ambient NPC movement ────────────────────
      // Organic patrol: walk each leg without stopping, rest a random beat
      // only at waypoints, keep a per-villager stride, and glance around
      // (or at the hero) while idle — the step-stop-step march read robotic.
      for (const anpc of (state.ambientNPCs || [])) {
        if (anpc.moving) {
          anpc.moveTimer += dt;
          const raw = Math.min(anpc.moveTimer / anpc.speed, 1);
          // Ease out on the tile that ends at a waypoint so the stop lands softly.
          const progress = anpc.easeStop ? 1 - (1 - raw) * (1 - raw) : raw;
          anpc.pixelX = lerp(anpc.fromX, anpc.toX, progress);
          anpc.pixelY = lerp(anpc.fromY, anpc.toY, progress);
          if (raw >= 1) {
            anpc.pixelX = anpc.toX;
            anpc.pixelY = anpc.toY;
            anpc.moving = false;
            const waypoint = anpc.waypoints[anpc.waypointIdx];
            const stop = anpc.easeStop
              ? resolveAmbientWaypointStop(waypoint, Math.random())
              : null;
            anpc.pauseTimer = stop?.duration ?? 0;
            anpc.stopFace = stop?.face ?? null;
            anpc.activity = stop?.activity ?? null;
            if (anpc.stopFace !== null) anpc.dir = anpc.stopFace;
            anpc.lookTimer = 0.5 + Math.random() * 0.9;
          }
        } else {
          anpc.pauseTimer -= dt;
          if (anpc.pauseTimer > 0) {
            // Idle life: meet the hero's eye when they pass close by,
            // otherwise glance around now and then.
            const pdx = p.col - anpc.col;
            const pdy = p.row - anpc.row;
            if (Math.abs(pdx) + Math.abs(pdy) <= 2) {
              anpc.dir = Math.abs(pdx) > Math.abs(pdy) ? (pdx < 0 ? 2 : 3) : (pdy < 0 ? 1 : 0);
            } else if (anpc.stopFace !== null) {
              anpc.dir = anpc.stopFace;
            } else {
              anpc.lookTimer -= dt;
              if (anpc.lookTimer <= 0) {
                if (Math.random() < 0.5) anpc.dir = Math.floor(Math.random() * 4);
                anpc.lookTimer = 0.9 + Math.random() * 1.5;
              }
            }
          } else {
            // Move to next waypoint
            anpc.waypointIdx = (anpc.waypointIdx + 1) % anpc.waypoints.length;
            const next = anpc.waypoints[anpc.waypointIdx];
            const dx = next.col - anpc.col;
            const dy = next.row - anpc.row;
            // Move one tile at a time toward waypoint
            const stepX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
            const stepY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
            // Prefer horizontal, then vertical
            const moveX = stepX !== 0 ? stepX : 0;
            const moveY = stepX !== 0 ? 0 : stepY;

            if (moveX !== 0 || moveY !== 0) {
              // Set direction
              if (moveY > 0) anpc.dir = 0;      // DOWN
              else if (moveY < 0) anpc.dir = 1;  // UP
              else if (moveX < 0) anpc.dir = 2;  // LEFT
              else if (moveX > 0) anpc.dir = 3;  // RIGHT

              anpc.moving = true;
              anpc.stopFace = null;
              anpc.activity = null;
              anpc.moveTimer = 0;
              anpc.fromX = anpc.col * TILE_SIZE;
              anpc.fromY = anpc.row * TILE_SIZE;
              anpc.col += moveX;
              anpc.row += moveY;
              anpc.toX = anpc.col * TILE_SIZE;
              anpc.toY = anpc.row * TILE_SIZE;

              // If we haven't reached the waypoint yet, don't advance index
              const wp = anpc.waypoints[anpc.waypointIdx];
              const reached = anpc.col === wp.col && anpc.row === wp.row;
              anpc.easeStop = reached; // soften only the landing step
              if (!reached) {
                anpc.waypointIdx = (anpc.waypointIdx - 1 + anpc.waypoints.length) % anpc.waypoints.length;
              }
            }
            anpc.pauseTimer = 0;
          }
        }
      }

      // ─── NPC detection (face-adjacent) ──────────
      // Tag locked missions so Enter is refused and the prompt explains.
      const npc = getNearbyNPC(room, island, p.col, p.row, p.dir);
      state.nearNPC = npc
        ? { ...npc, locked: !isMissionUnlocked(island, npc.id, completed) }
        : null;

      // Locked-Enter nudge decays (renderNPCPrompt flashes while > 0).
      if (state.lockedNudge > 0) state.lockedNudge -= dt;

      // ─── Mentor detection (face-adjacent) ───────
      state.nearMentor = isNearMentor(room, p.col, p.row, p.dir);

      // ─── Exit detection (standing on mat) ───────
      state.onExit = isOnExitMat(room, p.col, p.row);
    },

    render: (ctx, state) => {
      if (!atlasRef.current) return;

      // The sky/wall backdrop fills the viewport and must not zoom or crop.
      renderRoomBackground(ctx, island);

      // Enlarge only the playable room. Keeping the backdrop, HUD, prompts and
      // dialogs out of this transform preserves their screen-space dimensions.
      ctx.save();
      applyRoomSceneTransform(ctx);
      renderRoomTiles(ctx, room, atlasRef.current);
      if (island === 'growing') renderGrowingOutdoor(ctx, room);
      if (island === 'local') renderLocalMarket(ctx, room, state.time);
      if (island === 'circular') renderCircularNeighborhood(ctx, room);
      if (island === 'foodwaste') renderFoodwasteKitchen(ctx, room);
      renderRoomVignettes(ctx, room, state.time);
      renderRoomDecorations(ctx, room);
      renderNPCPreviewItems(ctx, room, island, completed, state.time);
      renderRoomNPCs(ctx, room, island, atlasRef.current, completed, state.time, state);
      renderMentorNPC(ctx, room, state.time, state);
      renderAmbientNPCs(ctx, state);
      renderRoomPlayer(ctx, state, atlasRef.current);
      ctx.restore();

      renderNPCPrompt(ctx, state);
      renderMentorPrompt(ctx, state);
      renderExitPrompt(ctx, state);
      renderRoomHUD(ctx, state, island, points, completed.length, i18nRef.current, totalStars);
      // Centred, the Foodwaste story's last line falls under the touch ▲ on a phone
      // held sideways; there the card sits under the HUD instead. Decided every frame, so it
      // follows a resize / rotation and both ways the story opens (arrival, talking again).
      // On phone landscape every mentor dialog sits at the top, clear of the touch
      // arrows and of the ✕ button, which otherwise sat next to «Continue».
      renderMentorDialog(ctx, state, { top: viewportProfile === 'phone-landscape' });
      renderCeremony(ctx, state);
      renderReflectionCard(ctx, state);

      // Iris wipe overlay (centered on player in room)
      const OX = (CANVAS_W - 20 * 32) / 2; // 320
      const OY = (CANVAS_H - 15 * 32) / 2; // 112
      const pp = state.player;
      const irisCenter = projectRoomScenePoint(
        OX + pp.pixelX + 16,
        OY + pp.pixelY + 16,
      );
      drawIrisWipe(ctx, irisCenter.x, irisCenter.y, state.irisOpenness, CANVAS_W, CANVAS_H);
    },
  });

  // The canvas loop intentionally stores mutable state in a ref. Publishing
  // that ref on the canvas gives E2E tests the same stable inspection hook used
  // by the mini-games, without introducing React renders into the RAF loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    canvas._stateRef = stateRef;
    return () => {
      delete canvas._stateRef;
    };
  }, [stateRef]);

  // Enter key — talk to NPC or exit room | Escape — quick exit
  useEffect(() => {
    const triggerIrisExit = (target, data) => {
      const s = stateRef.current;
      if (s.irisClosing) return;
      s.irisClosing = true;
      setTimeout(() => onNavigate(target, data), IRIS_DURATION * 1000 + 80);
    };

    const handleKeyDown = (e) => {
      if (tabletPortrait) return;
      const s = stateRef.current;
      if (s.irisClosing) return; // block input during transition
      if (e.repeat) return; // a held key must not chain dismiss-card-then-launch
      if (keyBelongsToDomTarget(e)) return; // a focused button/input owns this key

      // The ceremony swallows all input; Enter/Space/Escape on the card
      // dismisses it for good (markCeremonySeen persists, so it never re-fires).
      if (s.ceremony) {
        if (s.ceremony.phase === 'card' && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) {
          s.ceremony = null;
          markCeremonySeen(island);
        }
        return;
      }

      // The reflection card swallows input: ↑/↓ pick, Enter confirms →
      // acknowledgment, Enter/Escape dismisses for good (persisted).
      if (s.reflection) {
        const r = s.reflection;
        const optCount = i18nRef.current.reflectionOpts?.length || 3;
        if (r.phase === 'ask') {
          if (e.key === 'ArrowUp') r.selIdx = (r.selIdx + optCount - 1) % optCount;
          else if (e.key === 'ArrowDown') r.selIdx = (r.selIdx + 1) % optCount;
          else if (e.key === 'Enter' || e.key === ' ') { r.phase = 'ack'; playSound('success'); }
        } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          s.reflection = null;
          markReflectionSeen(island);
        }
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        if (s.mentorDialog) {
          s.mentorDialog = null;
          return;
        }
        if (s.nearMentor && !s.nearNPC) {
          const str = i18nRef.current;
          let text;
          if (completed.length >= 3) {
            text = str.mentorDone;
          } else if (completed.length === 0) {
            text = str.mentorStory;
          } else {
            text = str.mentorHints?.[nextId] || str.mentorStory;
          }
          s.mentorDialog = { text };
          return;
        }
        if (s.nearNPC) {
          if (s.nearNPC.locked) {
            // Locked: refuse launch. The prompt flashes red/shakes for the first
            // beat (renderNPCPrompt: > 0.9), then the amber halo keeps pointing
            // at the prerequisite NPC for the remainder (renderRoomNPCs).
            s.lockedNudge = 1.6;
          } else {
            triggerIrisExit('game', {
              island,
              mission: s.nearNPC.component,
              missionId: s.nearNPC.id,
            });
          }
        } else if (s.onExit) {
          triggerIrisExit('hub');
        }
      } else if (e.key === 'Escape') {
        if (s.mentorDialog) {
          s.mentorDialog = null;
          return;
        }
        triggerIrisExit('hub');
      }
    };
    // Click/tap anywhere also dismisses the mentor dialog and the ceremony
    // card (non-readers, tablets)
    const handleClick = (e) => {
      if (tabletPortrait) return;
      const s = stateRef.current;
      if (s.ceremony?.phase === 'card') {
        s.ceremony = null;
        markCeremonySeen(island);
        return;
      }
      // Reflection: tap an option to answer; any tap dismisses the ack.
      if (s.reflection) {
        if (s.reflection.phase === 'ask') {
          const pt = getCanvasPointer(canvasRef.current, e);
          const hit = (s.reflectionOptionRects || []).find(
            (o) => pt.x >= o.x && pt.x <= o.x + o.w && pt.y >= o.y && pt.y <= o.y + o.h,
          );
          if (hit) {
            s.reflection.selIdx = hit.idx;
            s.reflection.phase = 'ack';
            playSound('success');
          }
        } else {
          s.reflection = null;
          markReflectionSeen(island);
        }
        return;
      }
      if (s.mentorDialog) {
        s.mentorDialog = null;
        return;
      }
      // «Back to map» wooden pill in the canvas HUD — same iris wipe as Escape.
      const pt = getCanvasPointer(canvasRef.current, e);
      const r = s.exitButtonRect;
      if (r && pt.x >= r.x && pt.x <= r.x + r.width && pt.y >= r.y && pt.y <= r.y + r.height) {
        triggerIrisExit('hub');
      }
    };
    // Hover feedback for the back pill (brightens + pointer cursor).
    const handleMove = (e) => {
      const s = stateRef.current;
      const r = s.exitButtonRect;
      if (!r) return;
      const pt = getCanvasPointer(canvasRef.current, e);
      const over = pt.x >= r.x && pt.x <= r.x + r.width && pt.y >= r.y && pt.y <= r.y + r.height;
      s.exitButtonHover = over;
      if (canvasRef.current) canvasRef.current.style.cursor = over ? 'pointer' : 'default';
    };
    const canvas = canvasRef.current;
    window.addEventListener('keydown', handleKeyDown);
    canvas?.addEventListener('click', handleClick);
    canvas?.addEventListener('mousemove', handleMove);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      canvas?.removeEventListener('click', handleClick);
      canvas?.removeEventListener('mousemove', handleMove);
    };
  }, [island, onNavigate, markCeremonySeen, markReflectionSeen, tabletPortrait]);

  return (
    <div
      style={{
        ...styles.container,
        background: ISLAND_BACKDROPS[island] || WORLD_ART.oceanDeep,
      }}
      data-viewport-profile={viewportProfile}
    >
      {!atlasReady && <div style={styles.loading}>Loading...</div>}
      {/* Wrapper scopes absolute positioning to the canvas area */}
      <div style={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={styles.canvas}
          tabIndex={tabletPortrait ? -1 : 0}
          aria-hidden={tabletPortrait || undefined}
        />
      </div>

    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: WORLD_ART.oceanDeep, // #1A4A8E — matches canvas backdrop
    position: 'relative',
    overflow: 'hidden',
  },
  canvasWrapper: {
    position: 'relative',
    width: 'min(100vw, calc(100dvh * 1280 / 704))',
    height: 'min(100dvh, calc(100vw * 704 / 1280))',
    aspectRatio: '1280 / 704',
  },
  canvas: {
    width: '100%',
    height: '100%',
    imageRendering: 'pixelated',
    display: 'block',
    touchAction: 'none',
    outline: 'none',
  },
  loading: {
    position: 'absolute',
    zIndex: 200,
    color: '#fff',
    fontSize: 24,
    fontFamily: "'Fredoka', sans-serif",
  },
};
