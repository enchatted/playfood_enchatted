const FINAL_STAGE = 3;

/**
 * Selects the shared wildlife layer for an island's completion stage.
 * One returning bird and fish make 2/3 feel alive without competing with
 * the full ecosystem reward at 3/3.
 */
export function getRestorationStage(completed, available = {}) {
  const stage = Math.max(0, Math.min(FINAL_STAGE, Number(completed) || 0));
  const availableBirds = Math.max(0, Number(available.birds) || 0);
  const availableFish = Math.max(0, Number(available.fish) || 0);

  if (stage < 2) {
    return {
      birdCount: 0,
      fishCount: 0,
      finalIntensity: 0,
      shoreSparkleCount: 0,
    };
  }

  if (stage === 2) {
    return {
      birdCount: Math.min(1, availableBirds),
      fishCount: Math.min(1, availableFish),
      finalIntensity: 0,
      shoreSparkleCount: 0,
    };
  }

  return {
    birdCount: availableBirds,
    fishCount: availableFish,
    finalIntensity: 1,
    shoreSparkleCount: 6,
  };
}
