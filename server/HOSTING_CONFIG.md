# Local and hosted server settings

The same-origin game and panel need no cross-origin grants. The safe defaults are:

```ini
TRUST_PROXY = no
CORS_ORIGINS =
```

These are optional keys in `playfood.config.txt`. Proxy and CORS settings are read
when the server is built; restart after changing them. `PANEL_ENABLED` still reloads
within 30 seconds without a restart.

A local share launcher should bind only to `127.0.0.1`. The hosted `npm start`
entry continues to bind to `0.0.0.0` for container/reverse-proxy installations. Do
not treat that hosted entry as a loopback-only launcher.

## Hosting behind an existing proxy

Before deploying this change, configure only the proxy IP addresses or CIDRs
that can actually connect to the app. For nginx on this machine, for example:

```ini
TRUST_PROXY = 127.0.0.1, ::1
```

If nginx connects over a container network, use its actual peer address/CIDR
instead. Restrict network access to the backend and make the proxy replace or
sanitize incoming forwarded headers. Do not trust an arbitrary client-supplied
`X-Forwarded-For`. Broad `yes`/`true`/`*` proxy settings are not supported.

This preserves separate event-rate buckets for real clients behind the named
proxy. Without explicit trust, event limiting uses the direct socket peer. The
panel login limiter always uses the socket peer, even behind a trusted proxy;
staff behind that peer share its temporary login limit.

## A separately hosted game frontend

Only if the game uses a different origin from this API, list its exact origins:

```ini
CORS_ORIGINS = https://game.example.org
```

Multiple origins are comma-separated; no wildcard or automatic reflection is
needed. In the default development setup, Vite proxies `/api` and `/panel` to
port 4000: the browser still sees its own origin, so a CORS grant is unnecessary.
A direct browser call across ports needs an explicit grant such as
`http://localhost:3000` or `http://127.0.0.1:3000`.

The code does not change the real installation configuration on disk. Check these
settings against the actual hosting network before deploying; this local change
is not evidence that deployed hosting or its proxy logs have been inspected.

## API for local packaging

```js
const app = await buildServer({
  dataDir,
  clientDist,
  loggerLevel: 'warn',
  trustProxy: false,
  corsOrigins: [],
});
await app.listen({ host: '127.0.0.1', port });
```

`loggerLevel: 'warn'` suppresses routine request messages while retaining warnings
and errors. If omitted, the hosted logger retains its previous policy (`error`
in production, `info` otherwise). Proxy/CORS options can be omitted to use the
configuration file.

Supported Node range is `>=22 <27`; `.nvmrc` selects Node 24 by default. Re-run
`npm ci` after switching Node major versions so the SQLite native binary matches
the selected runtime. First install needs npm and the platform's prebuilt-binary
download host; if unavailable, native build tooling is required.
