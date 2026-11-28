import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatMarketMoney } from './marketCurrency.js';
import { MarketGoalRow, MarketItemCard, marketGoalStates } from './MarketTripPanels.jsx';

/**
 * Market Trip checkout review.
 *
 * Opens when the basket is full. The child sees every product, the totals and
 * the three goals, then pays or goes back to change a stall. Nothing ends the
 * shop automatically; over the money the pay button stays disabled and the
 * panel says how much is missing.
 *
 * Keyboard stays with the game loop (Enter pays, Q goes back) so the same keys
 * work as in the rest of the market; the buttons serve mouse and touch.
 */
export default function MarketTripCheckout({ hud, onPay, onChange }) {
  const { t, i18n } = useTranslation();
  const goals = marketGoalStates(hud.goals);
  const missing = Math.max(0, hud.money - hud.budget);

  return (
    <div className="market-trip-checkout-backdrop" data-testid="market-trip-checkout">
      <div
        className="market-trip-checkout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-trip-checkout-title"
      >
        <h2 id="market-trip-checkout-title">🧾 {t('market.checkout_title')}</h2>

        <div className="market-trip-checkout-items">
          {hud.items.map((item) => <MarketItemCard key={item.key || item.name} item={item} long />)}
        </div>

        <div className="market-trip-checkout-totals">
          <span>💰 {formatMarketMoney(hud.money, i18n.language)} / {formatMarketMoney(hud.budget, i18n.language)}</span>
          <span>🌍 {hud.miles} {t('market.transport_short')} · ⭐ ≤ {hud.transportTarget}</span>
        </div>

        <div className="market-trip-checkout-goals" data-testid="market-trip-checkout-goals">
          <MarketGoalRow state={goals.money} testId="market-trip-checkout-goal-money">
            {t('market.goal_money_done', { budget: formatMarketMoney(hud.budget, i18n.language) })}
          </MarketGoalRow>
          <MarketGoalRow state={goals.seasonal} testId="market-trip-checkout-goal-seasonal">
            {t('market.goal_seasonal')}
          </MarketGoalRow>
          <MarketGoalRow state={goals.transport} testId="market-trip-checkout-goal-transport">
            {t('market.goal_transport', { target: hud.transportTarget })}
          </MarketGoalRow>
        </div>

        {!hud.canPay && (
          <p className="market-trip-checkout-warning" role="alert" data-testid="market-trip-checkout-missing">
            ⚠️ {t('market.checkout_missing', { amount: formatMarketMoney(missing, i18n.language) })}
          </p>
        )}

        <div className="market-trip-checkout-actions">
          <button
            type="button"
            className="market-trip-checkout-change"
            data-testid="market-trip-checkout-change"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onChange}
          >
            ↩ {t('market.change_something')}
          </button>
          <button
            type="button"
            className="market-trip-checkout-pay"
            data-testid="market-trip-checkout-pay"
            disabled={!hud.canPay}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onPay}
          >
            💳 {t('market.pay')}
          </button>
        </div>
        <p className="market-trip-checkout-hint">{t(hud.canPay ? 'market.checkout_hint' : 'market.checkout_hint_blocked')}</p>
      </div>
    </div>
  );
}
