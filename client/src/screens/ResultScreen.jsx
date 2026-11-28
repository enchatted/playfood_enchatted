import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DRAFT_MODE } from '../config/draftMode.js';
import { ISLAND_COLORS, BRAND } from '../styles/brandColors.js';
import { playMusicCue, stopMusicCue } from '../utils/music.js';
import ResultNextStep from '../components/ResultNextStep.jsx';
import SourcePanel from '../components/SourcePanel.jsx';
import { ISLAND_KSAV, GAME_LEARNING_GOALS } from '../data/ksav.js';
import { PLANT_ORIGINS } from '../data/growing.js';
import { formatMarketMoney } from '../games/local/marketCurrency.js';

// food id → emoji, for the "Έμαθες πού μεγαλώνουν" recap chips (WhereDoesItGrow).
const PLANT_EMOJI = Object.fromEntries(PLANT_ORIGINS.map((p) => [p.id, p.emoji]));

// One-shot star/confetti CSS for the WhereDoesItGrow result panel (mockup «ΠΡΟΤΑΣΗ Β»).
const STAR_RESULT_KEYFRAMES = `
@keyframes wdigStarPop {
  0% { transform: scale(.2) rotate(-22deg); opacity: 0; }
  55% { transform: scale(1.18) rotate(4deg); opacity: 1; }
  78% { transform: scale(.94) rotate(-2deg); }
  100% { transform: scale(1) rotate(0); }
}
@keyframes wdigLockBreathe { 0%,100% { opacity:.85; } 50% { opacity:1; transform: translateY(-2px); } }
@keyframes wdigNudgePulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
@keyframes wdigStreakBounce { 0% { transform: scale(.7); opacity:0; } 60% { transform: scale(1.08); opacity:1; } 100% { transform: scale(1); } }
@keyframes wdigBurst { 0% { transform: translate(-50%,-50%) scale(.6); opacity:1; } 100% { transform: translate(-50%,-50%) scale(1.7); opacity:0; } }
`;

// Multiply a #rrggbb hex toward black by factor f (0..1) → "rgb(r,g,b)".
// Used to derive a darker shade of the island's brand color for gradients/text.
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r}, ${g}, ${b})`;
}

// Older Leftover Chef result payloads predate the shared completion-star field.
// Keep them legible by deriving the same 0–3 progress from the completed rescue
// goals, while always preferring a recorded result when one is available.
export function resolveLeftoverChefResultStars({ stars, completed, total }) {
  if (Number.isFinite(stars)) {
    return Math.max(0, Math.min(3, Math.trunc(stars)));
  }
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.floor(Math.max(0, Math.min(completed, total)) / total * 3);
}

export default function ResultScreen({
  island, mission, missionId, score, passed,
  healthyHarvests, wrongToolCount,
  tier: tierProp, healed, correct, suboptimal, mistakes, chemicalUses,
  stars, bestStreak, firstTryCount, completed, total, leaks, safe, transgressed,
  missed, traveled, traveledCount, marketRecap,
  axes,
  roundSeed,
  onNavigate,
}) {
  const { t, i18n } = useTranslation();
  const isLeftoverChef = mission === 'LeftoverChef';
  const resultStars = isLeftoverChef
    ? resolveLeftoverChefResultStars({ stars, completed, total })
    : stars;

  // First-try star rating (WhereDoesItGrow). `stars` is a number 0–3 only for
  // games that opt in; everything else renders the classic tier/score layout.
  const hasStars = typeof resultStars === 'number';

  // A matched pair of gentle CC0 result cues replaces the old synthetic win
  // flourish. The failure cue stays deliberately quieter and encouraging.
  useEffect(() => {
    playMusicCue(passed ? 'success' : 'retry');
    return stopMusicCue;
  }, [passed]);

  const handleRetry = () => {
    onNavigate('game', {
      island,
      mission,
      missionId,
      ...(roundSeed !== null && roundSeed !== undefined ? { roundSeed } : {}),
    });
  };

  const s = DRAFT_MODE ? draftStyles : styles;

  // Brand the screen with this island's pillar color (PDF p.09 palette).
  // Cream card on an island-tinted backdrop keeps every result on-brand and
  // tells the player at a glance which island they just played.
  const tint = ISLAND_COLORS[island] || BRAND.green;
  const tintDark = shade(tint, 0.55);
  const tintText = shade(tint, 0.5);

  // Mission-specific real-life action prompt — bridges in-game knowledge to
  // behavior outside the game. Each mission can register its own prompt key.
  const realworldKey = {
    GardenPlanner: 'garden.realworld_prompt',
    SoilDoctor: 'soildoctor.realworld_prompt',
  }[mission];

  // Per-mission result tier: swap the generic Passed/Failed title for tier-specific
  // praise. GardenPlanner derives the tier from healthy-harvest count; SoilDoctor
  // passes a precomputed tier (gradeSoilDoctor: perfect/great/pass/fail). Each maps
  // to its own i18n namespace for the title/body strings.
  const tierNs = {
    GardenPlanner: 'garden.results',
    SoilDoctor: 'soildoctor.results',
    WhereDoesItGrow: 'wheredoesitgrow.results',
    MarketTrip: 'market.results',
    SeasonMatcher: 'season.results',
    SpotTheFake: 'spotthefake.results',
    FridgeManager: 'fridge.results',
    MealPlanner: 'meal_planner.results',
    LeftoverChef: 'leftover_chef.results',
    CompostCreator: 'compost.results',
    CircularCity: 'circularcity.results',
    PlanetaryBoundaries: 'planetary.results',
  }[mission];

  const tier = (() => {
    if (mission === 'GardenPlanner') {
      if (tierProp) return tierProp;
      if (healthyHarvests != null) {
        if (healthyHarvests >= 8) return 'perfect';
        if (healthyHarvests >= 6) return 'excellent';
        if (healthyHarvests >= 5) return 'pass';
        return 'fail';
      }
    }
    if ([
      'SoilDoctor', 'SpotTheFake', 'FridgeManager', 'MealPlanner', 'LeftoverChef',
      'CompostCreator', 'CircularCity', 'PlanetaryBoundaries',
    ].includes(mission) && tierProp) return tierProp;
    // WhereDoesItGrow maps stars → tier (3⭐ perfect / 2⭐ great / 1⭐ pass / 0 fail).
    if (hasStars) return tierProp || ['fail', 'pass', 'great', 'perfect'][resultStars];
    return null;
  })();
  const tierEmoji = hasStars
    ? (mission === 'MarketTrip'
        ? { perfect: '🏆', great: '🧺', pass: '🛒', fail: '🛒' }[tier]
        : mission === 'SeasonMatcher'
          ? ({ perfect: '🧺' }[tier] || '🛒')
          : { perfect: '🌻', excellent: '🌻', great: '🌻', pass: '🌱', fail: '🌱' }[tier])
    : ({ perfect: '🌟', excellent: '🎉', great: '🎉', pass: '✅', fail: '💪' }[tier] || null);

  // Soil Doctor run summary (plots healed + chemical/misstep counts) — a concrete
  // recap of how cleanly the player healed the soil.
  const showSoilSummary = mission === 'SoilDoctor' && typeof healed === 'number';
  const showSpotTheFakeSummary = mission === 'SpotTheFake' && typeof correct === 'number';
  const showFridgeSummary = mission === 'FridgeManager' && typeof correct === 'number';
  const showLeftoverSummary = mission === 'LeftoverChef' && typeof completed === 'number';
  const showCompostSummary = mission === 'CompostCreator' && typeof correct === 'number';
  const showCircularSummary = mission === 'CircularCity' && typeof correct === 'number';
  const showPlanetarySummary = mission === 'PlanetaryBoundaries'
    && typeof safe === 'number'
    && typeof transgressed === 'number';
  const showMealPlannerSummary = mission === 'MealPlanner'
    && axes
    && ['sustainability', 'waste', 'nutrition'].every((key) => typeof axes[key] === 'number');
  // SeasonMatcher "what travelled" debrief — the second teaching moment the
  // bespoke in-game overlay used to carry, now on the shared result screen.
  const showTraveled = mission === 'SeasonMatcher' && Array.isArray(traveled) && traveled.length > 0;
  const showSeasonMatcherSummary = mission === 'SeasonMatcher' && passed;
  const seasonMatcherCorrect = typeof correct === 'number' ? correct : 6;
  const seasonMatcherTraveled = typeof traveledCount === 'number'
    ? traveledCount
    : (Array.isArray(traveled) ? traveled.length : 0);
  const spotTheFakeResultValues = {
    correct: correct || 0,
    firstTryCount: firstTryCount || 0,
    total: total || 6,
  };

  // Wrong-tool soft hint — only when player struggled with tool choice ≥3 times.
  // Avoid spamming the hint to kids who only mis-tooled once or twice.
  const showWrongToolHint = mission === 'GardenPlanner'
    && typeof wrongToolCount === 'number'
    && wrongToolCount >= 3;

  // The registry remains the canonical partner-authored English source. Locale
  // files can override individual outcomes; missing translations safely fall
  // back to that canonical sentence instead of exposing an i18n key.
  const learningGoal = GAME_LEARNING_GOALS[mission]
    ? t(`result.learning_outcomes.games.${mission}`, {
        defaultValue: GAME_LEARNING_GOALS[mission],
      })
    : null;

  // ── Star trophy (generic 3-glyph row, any tier-based game) ──────────────
  const genericStarRow = hasStars ? (() => {
    const isPerfect = resultStars >= 3;
    return (
      <>
        <style>{STAR_RESULT_KEYFRAMES}</style>
        <div
          style={st.starRow}
          {...(isLeftoverChef ? {
            'data-testid': 'leftover-chef-result-stars',
            role: 'img',
            'aria-label': `${resultStars} out of 3 stars`,
          } : {})}
        >
          {[0, 1, 2].map((i) => {
            const lit = i < resultStars;
            const mid = i === 1;
            const justEarned = lit && i === resultStars - 1; // pop the highest lit star
            return (
              <div key={i} style={{ position: 'relative', ...(mid ? st.starMid : st.starSide) }}>
                {justEarned && mid && <span style={st.starBurst} />}
                <span
                  style={{
                    fontSize: mid
                      ? (showSeasonMatcherSummary
                          ? 'clamp(48px, 7vh, 60px)'
                          : 'clamp(52px, 9vh, 76px)')
                      : (showSeasonMatcherSummary
                          ? 'clamp(40px, 6vh, 52px)'
                          : 'clamp(44px, 7.5vh, 60px)'),
                    lineHeight: 1,
                    display: 'block',
                    color: lit ? '#F4B740' : '#E0D8C4',
                    filter: lit
                      ? 'drop-shadow(0 4px 4px rgba(120,80,10,0.32))'
                      : 'drop-shadow(0 2px 3px rgba(60,60,50,0.2))',
                    transform: i === 0 ? 'rotate(-7deg)' : i === 2 ? 'rotate(7deg)' : 'none',
                    animation: justEarned
                      ? 'wdigStarPop 0.7s cubic-bezier(.34,1.56,.64,1) both'
                      : (!lit ? 'wdigLockBreathe 3s ease-in-out infinite' : 'none'),
                  }}
                  data-star-state={lit ? 'filled' : 'empty'}
                >
                  {lit ? '★' : '☆'}
                </span>
              </div>
            );
          })}
        </div>

        {isPerfect && (
          <div style={st.confetti} aria-hidden="true">
            {['#6DB06C', '#F4B740', '#FF7043', '#8FBF6E', '#FFE08A', '#3E8E6F'].map((c, i) => (
              <i key={i} style={{
                position: 'absolute', top: '40%', left: `${12 + i * 14}%`,
                width: 9, height: 9, borderRadius: i % 2 ? '50%' : 2, background: c,
                animation: `wdigStarPop 1.2s ease-out ${i * 0.08}s both`,
              }} />
            ))}
          </div>
        )}
      </>
    );
  })() : null;

  // ── WhereDoesItGrow extras: nudge, ladder, streak, learned-foods chips ────
  const wdigExtraPanel = (hasStars && mission === 'WhereDoesItGrow') ? (() => {
    const learned = (missed || []).filter((m) => PLANT_EMOJI[m.id]);
    const originLabel = (origin) => t(`wheredoesitgrow.spot_${origin}`);
    return (
      <>
        {stars < 3 && (
          <div style={st.nudge}>🌟 {t('wheredoesitgrow.results.nudge')}</div>
        )}

        {mission === 'WhereDoesItGrow' && (
          <div style={st.ladder}>{t('wheredoesitgrow.results.ladder')}</div>
        )}

        {bestStreak >= 2 && (
          <div style={st.streak}>🔥 {t('wheredoesitgrow.results.streak', { n: bestStreak })}</div>
        )}

        {learned.length > 0 && (
          <div style={st.learned}>
            <div style={st.learnedLabel}>{t('wheredoesitgrow.results.learned_label')}</div>
            <div style={st.learnChips}>
              {learned.map((m, i) => (
                <span key={`${m.id}-${i}`} style={st.lchip}>
                  <span style={{ fontSize: 16 }}>{PLANT_EMOJI[m.id]}</span>
                  <span style={{ color: '#6DB06C', fontWeight: 800 }}>→</span>
                  <span style={{ color: '#7A5A1B' }}>{originLabel(m.origin)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </>
    );
  })() : null;

  return (
    <div
      style={{
        ...s.container,
        background: `linear-gradient(160deg, ${tint} 0%, ${tintDark} 100%)`,
      }}
    >
      <div style={{
        ...s.card,
        ...(showSeasonMatcherSummary ? styles.seasonCard : {}),
        ...(isLeftoverChef ? leftoverChefResultStyles.card : {}),
        borderColor: tint,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {!hasStars && (
          <h1 style={s.emoji}>{tierEmoji || (passed ? '🎉' : '💪')}</h1>
        )}
        {genericStarRow}{wdigExtraPanel}
        <h2 style={{
          ...s.title,
          ...(showSpotTheFakeSummary ? spotResultStyles.title : {}),
          ...(isLeftoverChef ? leftoverChefResultStyles.title : {}),
        }}>
          {showSeasonMatcherSummary
            ? t('season.results.completion_title')
            : tier
            ? t(`${tierNs}.tier_${tier}_title`)
            : (passed ? t('result.passed') : t('result.failed'))}
        </h2>
        {mission !== 'SeasonMatcher' && (
          <p style={{
            ...s.score,
            ...(isLeftoverChef ? leftoverChefResultStyles.score : {}),
            color: tintText,
          }}>{t('result.your_score', { score })}</p>
        )}
        {showSeasonMatcherSummary && (
          <p style={styles.seasonSummary} data-testid="season-matcher-result-summary">
            🧺 {t('season.results.completion_summary', { count: seasonMatcherCorrect })}
          </p>
        )}
        {tier ? (
          <p style={{
            ...(tier === 'fail' ? s.encouragement : s.feedback),
            ...(showSpotTheFakeSummary ? spotResultStyles.feedback : {}),
          }}>
            {t(
              `${tierNs}.tier_${tier}_body`,
              mission === 'SpotTheFake' ? spotTheFakeResultValues : undefined,
            )}
          </p>
        ) : passed ? (
          <p style={s.feedback}>{t('result.well_done')}</p>
        ) : (
          <p style={s.encouragement}>{t('result.keep_going')}</p>
        )}
        {showSeasonMatcherSummary && (
          <p style={styles.seasonTransportSummary}>
            ✈️ {t('season.results.transport_summary', { count: seasonMatcherTraveled })}
          </p>
        )}
        {showTraveled && (
          <div style={styles.seasonTraveledBox}>
            <p style={{ ...styles.seasonTraveledTitle, color: tintText }}>
              {t('season.results.traveled_title')}
            </p>
            {traveled.map((it, i) => (
              <p key={i} style={styles.seasonTraveledRow}>
                ✈️ {it.emoji} {it.name}: {it.window}
              </p>
            ))}
          </div>
        )}
        {showSeasonMatcherSummary && (
          <div style={styles.seasonLearningRecap}>
            <strong>{t('season.results.learning_recap_title')}</strong>
            <p style={{ margin: '4px 0 0' }}>{t('season.results.learning_recap')}</p>
          </div>
        )}
        {mission === 'MarketTrip' && marketRecap && (
          <>
            <div style={{ ...styles.seasonTraveledBox, width: '100%', boxSizing: 'border-box' }} data-testid="market-trip-result-goals">
              <p style={{ ...styles.seasonTraveledTitle, color: tintText }}>
                ⭐ {t('market.recap_goals_title')}
              </p>
              {[
                ['money', t('market.goal_money_done', { budget: formatMarketMoney(marketRecap.budget, i18n.language) }),
                  `${formatMarketMoney(marketRecap.money, i18n.language)} / ${formatMarketMoney(marketRecap.budget, i18n.language)}`],
                ['seasonal', t('market.goal_seasonal'), null],
                ['transport', t('market.goal_transport', { target: marketRecap.transportTarget }),
                  `${marketRecap.transport} / ${marketRecap.transportTarget}`],
              ].map(([key, label, value]) => (
                <p key={key} style={styles.seasonTraveledRow} data-goal-met={marketRecap.goals?.[key] ? 'true' : 'false'}>
                  {marketRecap.goals?.[key] ? '✅' : '❌'} {label}{value ? ` (${value})` : ''}
                </p>
              ))}
            </div>
            <div style={styles.seasonLearningRecap} data-testid="market-trip-result-learned">
              <strong>{t('market.recap_learned_title')}</strong>
              {/* The lesson follows the goal the child missed first. */}
              <p style={{ margin: '4px 0 0' }}>{t(!marketRecap.goals?.seasonal ? 'market.recap_learned_season'
                : !marketRecap.goals?.transport ? 'market.recap_learned_transport' : 'market.recap_learned')}</p>
            </div>
          </>
        )}
        {showSoilSummary && (
          <p style={s.runSummary}>
            {t('soildoctor.results.summary', {
              healed,
              chemicalUses: chemicalUses || 0,
              mistakes: mistakes || 0,
            })}
          </p>
        )}
        {showSpotTheFakeSummary && (
          <p
            style={{ ...s.runSummary, ...spotResultStyles.summary }}
            data-testid="spot-the-fake-result-summary"
          >
            {t('spotthefake.results.summary', {
              correct,
              firstTryCount: firstTryCount || 0,
              total: total || 0,
              mistakes: mistakes || 0,
            })}
          </p>
        )}
        {showFridgeSummary && (
          <p style={s.runSummary}>
            {t('fridge.results.summary', {
              correct,
              total: total || 0,
              firstTry: firstTryCount || 0,
            })}
          </p>
        )}
        {showLeftoverSummary && (
          <p style={s.runSummary}>
            {t('leftover_chef.results.summary', {
              completed,
              total: total || 3,
            })}
          </p>
        )}
        {showCompostSummary && (
          <p style={s.runSummary}>
            {t('compost.results.summary', { correct, total: total || 12 })}
          </p>
        )}
        {showCircularSummary && (
          <p style={s.runSummary}>
            {t('circularcity.results.summary', {
              firstTryCount: firstTryCount || 0,
              correct,
              total: total || 8,
              leaks: leaks || 0,
            })}
          </p>
        )}
        {showCircularSummary && (
          <p style={s.scoreNote} data-testid="circular-score-note">
            {t('circularcity.results.score_note')}
          </p>
        )}
        {showPlanetarySummary && (
          <p style={s.runSummary}>
            {t('planetary.results.summary', {
              safe,
              total: total || 9,
              transgressed,
            })}
          </p>
        )}
        {showMealPlannerSummary && (
          <p style={s.runSummary}>
            {t('meal_planner.results.summary', axes)}
          </p>
        )}
        {showWrongToolHint && (
          <p style={s.wrongToolHint}>
            {t('garden.results.wrong_tool_hint')}
          </p>
        )}
        {realworldKey && (
          <p style={s.realworldPrompt}>
            {t(realworldKey)}
          </p>
        )}
        <ResultNextStep island={island} mission={mission} passed={passed} />
        <div style={s.buttons}>
          {passed ? (
            <button
              onClick={() => onNavigate('island', { island })}
              style={s.primaryBtn}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {t('result.back_to_island')}
            </button>
          ) : (
            <button
              onClick={handleRetry}
              style={s.retryBtn}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {t('result.try_again')}
            </button>
          )}
          <button
            onClick={() => onNavigate('hub')}
            style={{ ...s.secondaryBtn, borderColor: tint, color: tintText }}
          >
            {t('result.back_to_map')}
          </button>
        </div>
        {/* KSAV learning outcomes. English remains the canonical fallback;
            approved locale entries translate the child-facing result copy. */}
        {learningGoal && (
          <details style={{
            ...s.ksavBox,
            ...(showSeasonMatcherSummary ? { marginTop: 10 } : {}),
          }}>
            <summary style={s.ksavTitle}>📚 {t('result.learning_goals')}</summary>
            <p style={s.ksavGoal}>{learningGoal}</p>
            {ISLAND_KSAV[island] && (
              <ul style={s.ksavList}>
                {[
                  ['K', 'knowledge', ISLAND_KSAV[island].knowledge],
                  ['S', 'skills', ISLAND_KSAV[island].skills],
                  ['A', 'attitudes', ISLAND_KSAV[island].attitudes],
                  ['V', 'values', ISLAND_KSAV[island].values],
                ].flatMap(([letter, section, items]) =>
                  items.map((text, i) => (
                    <li key={`${letter}${i}`} style={s.ksavItem}>
                      <strong>[{letter}]</strong>{' '}
                      {t(`result.learning_outcomes.islands.${island}.${section}.${i}`, {
                        defaultValue: text,
                      })}
                    </li>
                  ))
                )}
              </ul>
            )}
          </details>
        )}
        <SourcePanel mission={mission} />
      </div>
    </div>
  );
}

// Brand theme — cream card (--pf-cream) on an island-tinted backdrop.
// Success CTAs use solid dark green (#2E7D32, white text 5:1); the island
// tint colors the backdrop, card border, score, and secondary button.
const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    // Scrolls when the card is taller than the window (short laptop viewports);
    // the card's margin:auto keeps it centered whenever it fits.
    overflowY: 'auto',
    padding: 'clamp(10px, 3vh, 24px) 0',
    boxSizing: 'border-box',
    // background set inline (per-island tint)
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    margin: 'auto',
    padding: 'clamp(14px, 2vh, 32px) clamp(20px, 4vw, 48px)',
    borderRadius: 'clamp(18px, 3vh, 28px)',
    background: BRAND.cream,
    boxShadow: '0 14px 48px rgba(0,0,0,0.28), inset 0 2px 0 rgba(255,255,255,0.6)',
    border: '3px solid', // borderColor set inline (island tint)
    animation: 'slide-up 0.5s ease-out',
    maxWidth: 'min(92vw, 560px)',
    boxSizing: 'border-box',
  },
  seasonCard: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  emoji: {
    fontSize: 'clamp(44px, 8vh, 72px)',
    margin: '0 0 clamp(2px, 1vh, 8px)',
    lineHeight: 1,
    filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.18))',
  },
  title: {
    fontSize: 'clamp(27px, 4.2vh, 36px)', fontWeight: 800, color: BRAND.text,
    margin: 'clamp(4px, 1vh, 8px) 0 clamp(4px, 1vh, 8px)', textAlign: 'center',
  },
  score: {
    fontSize: 'clamp(20px, 3.2vh, 26px)', fontWeight: 700,
    margin: '0 0 clamp(4px, 1vh, 8px)',
  }, // color set inline (tintText)
  // Bottom margin floor 14px (was 10px): the primary button's box-shadow
  // (0 6px 18px) reaches 12px above its border box, so on short screens
  // (844×390) a 10px gap let it touch the last line of this text when no
  // summary line sits in between. Taller screens (2vh ≥ 14px) are unchanged.
  feedback: {
    fontSize: 'clamp(15px, 2.3vh, 18px)', color: '#477246', fontWeight: 700,
    margin: '0 0 clamp(14px, 2vh, 16px)', textAlign: 'center',
  }, // brand-green, dark for cream
  encouragement: {
    fontSize: 'clamp(15px, 2.3vh, 18px)', color: '#B5611F', fontWeight: 600,
    margin: '0 0 clamp(14px, 2vh, 16px)', textAlign: 'center',
  }, // warm, dark for cream
  realworldPrompt: {
    fontSize: 16, color: '#1B5E20', fontWeight: 600,
    background: '#FFFFFF',
    padding: '12px 20px', borderRadius: 14,
    border: `2px solid ${BRAND.green}`,
    margin: '0 0 clamp(14px, 3vh, 24px)', maxWidth: 480, textAlign: 'center',
    lineHeight: 1.4,
  },
  wrongToolHint: {
    fontSize: 14, color: '#8A5A1E', fontWeight: 500,
    fontStyle: 'italic', margin: '0 0 12px', textAlign: 'center',
  },
  runSummary: {
    fontSize: 15, color: '#33691E', fontWeight: 600,
    background: '#FFFFFF', padding: '8px 16px', borderRadius: 12,
    border: '2px solid #AED581', margin: '0 0 16px', textAlign: 'center',
  },
  // Circular City only: what the points / loop count vs what earns stars.
  scoreNote: {
    fontSize: 13, color: '#3E5A1F', fontWeight: 500, lineHeight: 1.35,
    maxWidth: 460, margin: '0 auto clamp(6px, 1.2vh, 10px)', textAlign: 'center',
  },
  seasonSummary: {
    margin: '0 0 8px',
    padding: '8px 14px',
    border: '2px solid #6DB06C',
    borderRadius: 12,
    background: '#EEF8DC',
    color: '#2E6D35',
    fontSize: 'clamp(15px, 2.2vh, 18px)',
    fontWeight: 800,
    textAlign: 'center',
  },
  seasonTransportSummary: {
    margin: '0 0 4px',
    color: '#7A5A1B',
    fontSize: 'clamp(14px, 2vh, 16px)',
    fontWeight: 750,
    textAlign: 'center',
  },
  seasonTraveledBox: {
    marginTop: 8,
    padding: '8px 12px',
    textAlign: 'left',
    background: 'rgba(0,0,0,0.045)',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 12,
  },
  seasonTraveledTitle: {
    margin: '0 0 4px',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  seasonTraveledRow: {
    margin: '2px 0',
    color: '#3E2723',
    fontSize: 14,
    lineHeight: 1.25,
  },
  seasonLearningRecap: {
    width: '100%',
    boxSizing: 'border-box',
    margin: '7px 0 10px',
    padding: '8px 12px',
    border: '1px solid #D7C79A',
    borderRadius: 12,
    background: '#FFFDF2',
    color: '#3E2723',
    fontSize: 14,
    lineHeight: 1.35,
    textAlign: 'left',
  },
  buttons: { display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  primaryBtn: {
    fontSize: 'clamp(15px, 2.3vh, 18px)',
    fontWeight: 700,
    padding: 'clamp(10px, 1.8vh, 14px) clamp(22px, 3vw, 36px)',
    borderRadius: 30,
    // Solid: --pf-grad-green fades to cream and white text fell to about 1.2:1 (S4).
    background: '#2E7D32',
    border: '2px solid #1B5E20',
    color: '#fff',
    cursor: 'pointer',
    transition: 'transform 0.2s',
    fontFamily: 'inherit',
    boxShadow: '0 6px 18px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
    textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
  },
  retryBtn: {
    fontSize: 'clamp(15px, 2.3vh, 18px)',
    fontWeight: 700,
    padding: 'clamp(10px, 1.8vh, 14px) clamp(22px, 3vw, 36px)',
    borderRadius: 30,
    background: '#2E7D32',
    border: '2px solid #1B5E20',
    color: '#fff',
    cursor: 'pointer',
    transition: 'transform 0.2s',
    fontFamily: 'inherit',
    boxShadow: '0 6px 18px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
    textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
  },
  secondaryBtn: {
    fontSize: 'clamp(15px, 2.3vh, 18px)',
    fontWeight: 600,
    padding: 'clamp(10px, 1.8vh, 14px) clamp(22px, 3vw, 36px)',
    borderRadius: 30,
    background: '#FFFFFF',
    border: '2px solid', // borderColor set inline (island tint)
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    // color set inline (tintText)
  },
  ksavBox: {
    marginTop: 18,
    width: '100%',
    maxWidth: 480,
    background: 'rgba(255,255,255,0.65)',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 12,
    padding: '8px 14px',
    boxSizing: 'border-box',
  },
  ksavTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#5D5D5D',
    cursor: 'pointer',
    userSelect: 'none',
  },
  ksavGoal: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#444',
    lineHeight: 1.45,
    margin: '8px 0 4px',
  },
  ksavList: {
    margin: '4px 0 4px',
    paddingLeft: 16,
    listStyle: 'none',
  },
  ksavItem: {
    fontSize: 12,
    color: '#555',
    lineHeight: 1.5,
  },
};

// DRAFT_MODE: flat brand colors, no shadows/animation/text-shadow.
const draftStyles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    // Scrolls when the card is taller than the window (short laptop viewports);
    // the card's margin:auto keeps it centered whenever it fits.
    overflowY: 'auto',
    padding: 'clamp(10px, 3vh, 24px) 0',
    boxSizing: 'border-box',
    // background set inline (per-island tint)
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    margin: 'auto',
    padding: 'clamp(14px, 2vh, 32px) clamp(20px, 4vw, 48px)',
    borderRadius: 'clamp(12px, 2vh, 16px)',
    background: BRAND.cream,
    border: '3px solid', // borderColor set inline (island tint)
    maxWidth: 'min(92vw, 560px)',
    boxSizing: 'border-box',
  },
  emoji: { fontSize: 'clamp(44px, 8vh, 72px)', lineHeight: 1, margin: '0 0 clamp(2px, 1vh, 8px)' },
  title: {
    fontSize: 'clamp(27px, 4.2vh, 36px)', fontWeight: 800, color: BRAND.text,
    margin: 'clamp(4px, 1vh, 8px) 0', textAlign: 'center',
  },
  score: { fontSize: 'clamp(20px, 3.2vh, 26px)', fontWeight: 700, margin: '0 0 clamp(4px, 1vh, 8px)' }, // color set inline (tintText)
  feedback: { fontSize: 'clamp(15px, 2.3vh, 18px)', color: '#477246', fontWeight: 700, margin: '0 0 clamp(10px, 2vh, 16px)', textAlign: 'center' },
  encouragement: { fontSize: 'clamp(15px, 2.3vh, 18px)', color: '#B5611F', fontWeight: 600, margin: '0 0 clamp(10px, 2vh, 16px)', textAlign: 'center' },
  realworldPrompt: {
    fontSize: 16, color: '#1B5E20', fontWeight: 600,
    background: '#FFFFFF', padding: '12px 20px', borderRadius: 10,
    border: `2px solid ${BRAND.green}`, margin: '0 0 clamp(14px, 3vh, 24px)', maxWidth: 480, textAlign: 'center',
  },
  wrongToolHint: {
    fontSize: 14, color: '#8A5A1E', fontWeight: 500,
    fontStyle: 'italic', margin: '0 0 12px', textAlign: 'center',
  },
  runSummary: {
    fontSize: 15, color: '#33691E', fontWeight: 600,
    background: '#FFFFFF', padding: '8px 16px', borderRadius: 12,
    border: '2px solid #AED581', margin: '0 0 16px', textAlign: 'center',
  },
  // Circular City only: what the points / loop count vs what earns stars.
  scoreNote: {
    fontSize: 13, color: '#3E5A1F', fontWeight: 500, lineHeight: 1.35,
    maxWidth: 460, margin: '0 auto clamp(6px, 1.2vh, 10px)', textAlign: 'center',
  },
  buttons: { display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  primaryBtn: {
    fontSize: 'clamp(15px, 2.3vh, 18px)', fontWeight: 700,
    padding: 'clamp(10px, 1.8vh, 14px) clamp(22px, 3vw, 36px)', borderRadius: 30,
    background: 'var(--pf-green)', border: '2px solid #4E8A4D', color: '#fff',
    cursor: 'pointer', transition: 'transform 0.2s', fontFamily: 'inherit',
  },
  retryBtn: {
    fontSize: 'clamp(15px, 2.3vh, 18px)', fontWeight: 700,
    padding: 'clamp(10px, 1.8vh, 14px) clamp(22px, 3vw, 36px)', borderRadius: 30,
    background: 'var(--pf-green)', border: '2px solid #4E8A4D', color: '#fff',
    cursor: 'pointer', transition: 'transform 0.2s', fontFamily: 'inherit',
  },
  secondaryBtn: {
    fontSize: 'clamp(15px, 2.3vh, 18px)', fontWeight: 600,
    padding: 'clamp(10px, 1.8vh, 14px) clamp(22px, 3vw, 36px)', borderRadius: 30,
    background: '#FFFFFF', border: '2px solid', // borderColor set inline (island tint)
    cursor: 'pointer', fontFamily: 'inherit',
    // color set inline (tintText)
  },
};

// Spot the Fake uses longer, variable-length translations than most result
// screens. Explicit rhythm keeps multi-line titles and explanations separate
// from the run summary instead of relying on the browser's `normal` line-height.
const spotResultStyles = {
  title: {
    maxWidth: 440,
    lineHeight: 1.15,
  },
  feedback: {
    maxWidth: 440,
    lineHeight: 1.35,
    marginBottom: 12,
  },
  summary: {
    width: '100%',
    maxWidth: 440,
    boxSizing: 'border-box',
    lineHeight: 1.35,
  },
};

// The kitchen finale has comparatively little copy, so it needs a slightly
// wider, vertically balanced panel on desktop without forcing short tablets to
// overflow. This is deliberately scoped to Leftover Chef rather than changing
// the shared result layout for every mission.
const leftoverChefResultStyles = {
  card: {
    width: 'min(92vw, 620px)',
    maxWidth: 'min(92vw, 620px)',
    minHeight: 'min(560px, calc(100vh - 48px))',
    justifyContent: 'center',
    padding: 'clamp(20px, 3.5vh, 40px) clamp(24px, 5vw, 56px)',
  },
  title: {
    fontSize: 'clamp(30px, 4.8vh, 42px)',
  },
  score: {
    fontSize: 'clamp(21px, 3.4vh, 28px)',
  },
};

// First-try star trophy styles (WhereDoesItGrow), shared by both modes — the
// panel is flat enough that DRAFT_MODE needs no separate variant.
const st = {
  starRow: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    gap: 'clamp(6px, 1.2vh, 10px)', margin: '2px 0 clamp(3px, 1vh, 6px)',
  },
  starSide: { width: 'clamp(44px, 7.5vh, 60px)', marginBottom: 'clamp(3px, .8vh, 6px)' },
  starMid: { width: 'clamp(52px, 9vh, 76px)' },
  starBurst: {
    position: 'absolute', top: '50%', left: '50%', width: '130%', height: '130%',
    transform: 'translate(-50%,-50%)', borderRadius: '50%', pointerEvents: 'none', zIndex: -1,
    background: 'radial-gradient(circle, rgba(255,236,160,.95) 0%, rgba(244,183,64,.6) 35%, rgba(244,183,64,0) 70%)',
    animation: 'wdigBurst .6s ease-out .15s both',
  },
  nudge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    margin: 'clamp(2px, .7vh, 4px) auto clamp(4px, 1.2vh, 8px)', maxWidth: 280,
    fontSize: 'clamp(13px, 1.9vh, 15px)', fontWeight: 800, color: '#9A6A12',
    background: 'linear-gradient(180deg,#FFF6D9,#FFEFC0)',
    border: '1.5px solid #F0C766', padding: '6px 16px', borderRadius: 999,
    boxShadow: '0 2px 0 rgba(216,166,52,.4)',
    animation: 'wdigNudgePulse 2s ease-in-out infinite',
  },
  ladder: {
    textAlign: 'center', fontSize: 'clamp(11px, 1.6vh, 12.5px)', fontWeight: 700, color: '#8a6f54',
    margin: '0 auto clamp(6px, 1.5vh, 10px)', maxWidth: 280, lineHeight: 1.4, opacity: 0.92,
  },
  streak: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    margin: '0 auto clamp(7px, 1.7vh, 12px)',
    fontSize: 15, fontWeight: 800, color: '#fff',
    background: 'linear-gradient(180deg,#FF7043,#E64A19)',
    border: '1.5px solid #C13C12', padding: '6px 16px', borderRadius: 999,
    textShadow: '0 1px 1px rgba(120,30,0,.4)',
    boxShadow: '0 4px 0 rgba(170,50,10,.45), 0 6px 12px rgba(180,60,10,.26)',
    animation: 'wdigStreakBounce .5s cubic-bezier(.34,1.56,.64,1) both',
  },
  learned: {
    background: 'rgba(255,255,255,.62)', border: '1.5px solid #A5D6A7',
    borderRadius: 14, padding: 'clamp(7px, 1.4vh, 10px) 14px',
    margin: '2px 0 clamp(8px, 1.8vh, 14px)', maxWidth: 440,
  },
  learnedLabel: {
    fontSize: 12.5, fontWeight: 800, color: '#33691E',
    textAlign: 'center', marginBottom: 8,
  },
  learnChips: { display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  lchip: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 13, fontWeight: 700, color: '#5D4037',
    background: '#fff', border: '1.5px solid #A5D6A7',
    padding: '5px 12px', borderRadius: 999,
    boxShadow: '0 2px 5px rgba(28,52,10,.1)',
  },
  confetti: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 160,
    pointerEvents: 'none', overflow: 'hidden', zIndex: 2,
  },
};
