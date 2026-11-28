/* Upload-only PHP adapter; keeps the existing game and panel API contracts. */
(() => {
  const route = input => {
    if (typeof input !== 'string' || !input.startsWith('/api/') || input.startsWith('/api/index.php')) return input;
    const url = new URL(input, location.origin);
    const target = new URL('/api/index.php', location.origin);
    target.searchParams.set('route', url.pathname.slice(5));
    for (const [key, value] of url.searchParams) target.searchParams.append(key, value);
    return target.href;
  };
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (input, options) => fetchOriginal(route(input), options);
  if (navigator.sendBeacon) {
    const beaconOriginal = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => beaconOriginal(route(url), data);
  }
})();
