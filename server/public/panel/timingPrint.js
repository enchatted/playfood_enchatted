/** Show each measured time split on paper without changing the staff's view. */
export function expandTimingDetailsForPrint(root) {
  const previous = Array.from(root.querySelectorAll('details[data-timing-split]'),
    (details) => ({ details, open: details.open }));
  for (const { details } of previous) details.open = true;
  return () => {
    for (const { details, open } of previous) details.open = open;
  };
}

export function installTimingPrint(root, events, updatePeriod) {
  let restore = null;
  events.addEventListener('beforeprint', () => {
    updatePeriod();
    // Some print flows emit beforeprint twice; keep the original screen state.
    if (!restore) restore = expandTimingDetailsForPrint(root);
  });
  events.addEventListener('afterprint', () => {
    restore?.();
    restore = null;
  });
}
