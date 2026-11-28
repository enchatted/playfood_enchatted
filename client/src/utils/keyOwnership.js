/**
 * Decide whether a keydown belongs to the DOM control that has focus, so the
 * canvas game must NOT consume it.
 *
 * Two tiers:
 *  - Text-entry targets (inputs, textareas, selects, contenteditable) own every
 *    key: typing a "w" in the phygital code box must not walk the avatar.
 *  - Activation targets (buttons, links, summary) own only Enter and Space,
 *    their native "click" keys. Without this, a focused overlay button and the
 *    game both react to the same press (double action), and Space on the button
 *    is swallowed by the canvas hook's preventDefault before it can click.
 * Everything else (arrows, letters on a button, bare canvas) stays with the game.
 */
export function keyBelongsToDomTarget(e) {
  const el = e.target instanceof Element
    ? e.target.closest('input, textarea, select, [contenteditable="true"], button, a[href], summary')
    : null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  // A button owns its activation keys only when the child reached it with the
  // KEYBOARD (:focus-visible). A mouse click also leaves a button focused, but
  // treating that as ownership would trap Enter/Space on the button forever
  // (game chrome never re-focuses the canvas): a child clicking 📖 Instructions
  // once could never close the card again. Mouse-left focus therefore does NOT
  // own the keys; game buttons additionally prevent click-focus at the source.
  try {
    return el.matches(':focus-visible');
  } catch {
    return true; // engine without :focus-visible - fall back to plain focus
  }
}
