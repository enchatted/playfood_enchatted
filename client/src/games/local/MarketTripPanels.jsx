import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatMarketMoney } from './marketCurrency.js';

function meterColor(fraction) {
  if (fraction > 1) return '#C0392B';
  if (fraction > 0.85) return '#E2A33B';
  return '#5BA152';
}

export function MarketTripGuidance({ guidance, onOpenSource }) {
  return (
    <section
      className={`market-trip-guidance is-${guidance.kind}`}
      data-testid="market-trip-guidance"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="market-trip-guidance-text">{guidance.text}</span>
      {guidance.sourceKey && (
        <button type="button" onClick={() => onOpenSource(guidance.sourceKey)}>
          {guidance.sourceLabel}
        </button>
      )}
    </section>
  );
}

export function MarketTripFeedbackPopup({ text, warning = false }) {
  if (!text) return null;

  return (
    <div
      className={`market-trip-feedback-popup${warning ? ' is-warning' : ' is-success'}`}
      data-testid="market-trip-feedback-popup"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span aria-hidden="true">{warning ? '⚠️' : '✓'}</span>
      <span>{text}</span>
    </div>
  );
}

const COUNTRY_FLAG = { greece: '🇬🇷', portugal: '🇵🇹', belgium: '🇧🇪' };
const SEASON_ICON = { spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️' };
const GOAL_ICON = { done: '✅', track: '⬜', miss: '❌', warn: '⚠️' };

// Tag of a bought product. Long form for the checkout; the basket list uses the
// short origin label plus a season dot (🟢 in season · 🟠 out of season), the
// same colours as the badges on the stall cards.
export function marketItemTag(item, t) {
  if (!item.local) return { icon: '🌍', text: t('market.imported_label'), short: t('market.imported_label'), dot: '', kind: 'imported' };
  // The long form starts with the same «Local» word the basket shows.
  const local = t('market.local_label');
  if (item.craft) return { icon: '🏠', text: `${local} · ${t('market.tag_craft')}`, short: local, dot: '', kind: 'craft' };
  if (item.inSeason) return { icon: '🏠', text: `${local} · ${t('market.tag_in_season')}`, short: local, dot: '🟢', kind: 'in-season' };
  return { icon: '🏠', text: `${local} · ${t('market.tag_out_of_season')}`, short: local, dot: '🟠', kind: 'out-of-season' };
}

// done = reached with a full basket · track = still possible · miss = lost · warn = over the money for now
export function marketGoalStates(goals) {
  if (!goals) return { money: 'track', seasonal: 'track', transport: 'track' };
  return {
    money: goals.complete ? (goals.withinBudget ? 'done' : 'miss') : (goals.withinBudget ? 'track' : 'warn'),
    seasonal: goals.seasonal ? (goals.complete ? 'done' : 'track') : 'miss',
    transport: goals.transport ? (goals.complete ? 'done' : 'track') : 'miss',
  };
}

export function MarketGoalRow({ state, children, testId, value, valueAttr }) {
  return (
    <div className={`market-trip-goal is-${state}`} data-testid={testId} data-goal-state={state}>
      <span className="market-trip-goal-icon" aria-hidden="true">{GOAL_ICON[state]}</span>
      <span className="market-trip-goal-text">{children}</span>
      {value != null && <span className="market-trip-goal-value" {...valueAttr}>{value}</span>}
    </div>
  );
}

// One bought product. `long` (checkout) spells the season out in words.
export function MarketItemCard({ item, long = false }) {
  const { t, i18n } = useTranslation();
  const tag = marketItemTag(item, t);
  const label = long ? `${tag.icon} ${tag.text}` : `${tag.icon} ${tag.short}${tag.dot ? ` ${tag.dot}` : ''}`;
  return (
    <div className={`market-trip-item is-${tag.kind}${long ? ' is-long' : ''}`} data-testid="market-trip-item">
      <span className="market-trip-item-emoji" aria-hidden="true">{item.emoji}</span>
      <span className="market-trip-item-copy">
        <b className="market-trip-item-name" data-child-text>{item.name}</b>
        <span className="market-trip-item-origin" data-child-text title={tag.text}>{label}</span>
      </span>
      <strong className="market-trip-item-price" data-child-text>{formatMarketMoney(item.price, i18n.language)}</strong>
    </div>
  );
}

export function MarketTripReceipt({ hud, scenario, checkoutOpen = false, onOpenCheckout }) {
  const { t, i18n } = useTranslation();
  const completed = 8 - hud.remaining;
  const goals = marketGoalStates(hud.goals);
  const moneyFraction = hud.budget > 0 ? hud.money / hud.budget : 0;
  const transportScale = Math.max(hud.transportTarget * 1.5, hud.miles, 1);
  const overBudget = hud.money > hud.budget + 1e-9;
  // Hidden while a stall card or the instructions are open (one dialog at a time).
  const showCheckoutButton = hud.remaining === 0 && !checkoutOpen && !hud.choiceOpen && !hud.introOpen;

  return (
    <aside
      className="market-trip-receipt"
      data-testid="market-trip-receipt"
      aria-label={t('market.basket_title')}
    >
      <div className="market-trip-receipt-header">
        <span className="market-trip-receipt-icon">🧺</span>
        <span className="market-trip-receipt-title">{t('market.basket_title')}</span>
      </div>

      <div className="market-trip-receipt-body">
        <div className="market-trip-goals" data-testid="market-trip-goals">
          {/* The market's country and month sit with the goals they change
              (what is in season). The row wraps instead of cutting a long month. */}
          <div className="market-trip-goals-head">
            <span className="market-trip-goals-title">⭐ {t('market.goals_title')}</span>
            <span className="market-trip-scenario" data-testid="market-trip-scenario">
              {COUNTRY_FLAG[scenario.country]} {SEASON_ICON[scenario.season]} {t(`months_full.${scenario.month}`)}
            </span>
          </div>

          <MarketGoalRow
            state={goals.money}
            testId="market-trip-goal-money"
            value={<><b className={overBudget ? 'is-over' : ''}>{formatMarketMoney(hud.money, i18n.language)}</b><span> / {formatMarketMoney(hud.budget, i18n.language)}</span></>}
            valueAttr={{ 'data-market-budget-value': '' }}
          >
            {t('market.goal_money_short', { done: completed })}
          </MarketGoalRow>
          <div className="market-trip-meter-track" aria-hidden="true">
            <div
              className="market-trip-meter-fill"
              style={{ width: `${Math.min(100, moneyFraction * 100)}%`, background: meterColor(moneyFraction) }}
            />
          </div>
          <p className="market-trip-goal-note" data-testid="market-trip-goal-required">{t('market.goal_money_required')}</p>

          <MarketGoalRow state={goals.seasonal} testId="market-trip-goal-seasonal">
            {t('market.goal_seasonal')}
          </MarketGoalRow>

          <MarketGoalRow
            state={goals.transport}
            testId="market-trip-goal-transport"
            value={<><b className={hud.miles > hud.transportTarget ? 'is-over' : ''}>{hud.miles}</b><span> / {hud.transportTarget}</span></>}
            valueAttr={{ 'data-market-budget-value': '', 'data-market-transport-value': '' }}
          >
            {t('market.miles_label')}
          </MarketGoalRow>
          <div className="market-trip-meter-track" aria-hidden="true">
            <div
              className="market-trip-meter-fill"
              style={{
                width: `${Math.min(100, (hud.miles / transportScale) * 100)}%`,
                background: hud.miles > hud.transportTarget ? '#C0392B' : '#5BA152',
              }}
            />
            <span className="market-trip-meter-star" style={{ left: `${(hud.transportTarget / transportScale) * 100}%` }}>⭐</span>
          </div>
        </div>

        <div className="market-trip-items" data-testid="market-trip-items">
          {hud.items.length === 0
            ? <div className="market-trip-empty">🧺 {t('market.basket_empty_help')}</div>
            : hud.items.map((item) => <MarketItemCard key={item.key || item.name} item={item} />)}
        </div>

        {showCheckoutButton ? (
          <button
            type="button"
            className="market-trip-checkout-open"
            data-testid="market-trip-checkout-button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onOpenCheckout}
          >
            🧾 {t('market.go_checkout')}
          </button>
        ) : (
          <div className="market-trip-mentor" data-testid="market-trip-mentor" role="status" aria-live="polite">
            <span className="market-trip-mentor-face">👩🏽‍🌾</span>
            <span><b>{t('market.mentor_name')}</b><br />{hud.mentorText || t('market.mentor_welcome')}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
