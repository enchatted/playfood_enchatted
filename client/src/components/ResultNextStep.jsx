import React from 'react';
import { useTranslation } from 'react-i18next';
import useGameStore from '../store/gameStore.js';
import { MISSION_MAP, ROOMS, ROOM_COLS, ROOM_ROWS, nextMissionId } from '../overworld/islandRoomData.js';
import { isDemoBuild } from '../utils/demoMode.js';

export function resultNextStep(t, { island, mission, passed, completedMissions, ceremoniesSeen, finaleClaimed }) {
  const room = ROOMS[island];
  if (!room) return null;
  if (!passed) {
    const goal = t([
      `result.next.retryGoals.${mission}`,
      `missionIntro.${mission?.toLowerCase()}.goal`,
    ], { defaultValue: '' });
    return goal ? t('result.next.retry', { goal }) : t('result.try_again');
  }
  const next = nextMissionId(island, completedMissions[island]);
  if (next) {
    const npc = room.npcs.find(({ missionIdx }) => MISSION_MAP[island][missionIdx].id === next);
    const place = npc.row >= ROOM_ROWS / 2 ? 'bottomRight' : npc.col < ROOM_COLS / 2 ? 'topLeft' : 'topRight';
    return t('result.next.mission', {
      mission: t(`missions.${island}.${next}`),
      place: t(`result.next.places.${place}`),
    });
  }
  if (room.ceremony && !ceremoniesSeen.includes(island)) return t('result.next.celebrate');
  if (Object.keys(MISSION_MAP).every(key => !nextMissionId(key, completedMissions[key]))) {
    return t(finaleClaimed ? 'result.next.replay' : 'result.next.lighthouse');
  }
  return t(isDemoBuild() ? 'result.next.replay' : 'result.next.map');
}

export default function ResultNextStep({ island, mission, passed }) {
  const { t } = useTranslation();
  const completedMissions = useGameStore(s => s.completedMissions);
  const ceremoniesSeen = useGameStore(s => s.ceremoniesSeen);
  const finaleClaimed = useGameStore(s => s.finaleClaimed);
  const hint = resultNextStep(t, { island, mission, passed, completedMissions, ceremoniesSeen, finaleClaimed });
  return hint && <p data-result-next-step style={{ margin: '10px 0', fontWeight: 700 }}>{hint}</p>;
}
