# Serving the Dev UI on a Tailnet

`make dev` binds to loopback, which is right for a tool that supervises agents on the
machine running it. To drive the same dev server from a phone or another laptop on
your tailnet:

```
make dev-tailnet
```

It prints the URL and binds the Vite dev server to this host's Tailscale address:

```
Meeseeks dev UI: http://100.x.y.z:5173  (tailnet only, unauthenticated)
```

The MagicDNS name works too — `http://<host>.<tailnet>.ts.net:5173`. The address is
also reachable from the machine itself, so nothing is lost by binding there instead of
loopback; `http://localhost:5173` is simply not the URL any more.

## What is exposed, and what is not

Only Vite. The API server keeps binding to `127.0.0.1:5174` and is reached through
Vite's existing `/api` and `/ws` proxy, so exposing the UI does not separately put the
REST and WebSocket surface on the network:

```
ss -ltn | grep 517
LISTEN  127.0.0.1:5174      # API server — loopback
LISTEN  100.x.y.z:5173      # Vite — tailnet address only
```

The bind target is an address, not `host: true`. `true` binds every interface, which
would put the UI on whatever LAN, hotspot, or conference wifi the machine also happens
to be on. Binding one address means a laptop on the same café network cannot reach it
at all.

## Understand the trust boundary before using it

**Meeseeks has no authentication.** Anyone who can load the page can create tickets,
edit permission sets, and start agents that run with those permissions on *this*
machine. Exposing it means everything on your tailnet — every device you own, plus any
node shared into it — can do that.

A personal tailnet is a reasonable boundary for that. A shared or organisational one
needs an ACL restricting port 5173 to the devices you intend, since Meeseeks itself
will not turn anyone away.

For HTTPS and identity headers instead of a raw port, `tailscale serve --bg 5173`
fronts the loopback dev server with the tailnet's own certificate and access controls.
That path needs Vite's HMR client pointed at the proxied port
(`server.hmr.clientPort = 443`), which `make dev-tailnet` avoids by not proxying at all.

## How it works

`MEESEEKS_DEV_HOST` is the seam. `vite.config.ts` binds to it when set and stays on
loopback when it is not, so the exposure lives entirely in one env var and the Makefile
target that fills it from `tailscale ip -4`. There is no second config file and no flag
to remember.

Vite rejects `Host` headers it was not told about, so the config also sets
`allowedHosts: ['.ts.net']` — without it, the IP works and the MagicDNS name returns a
blocked-request error.

Production has its own seam and does not use this one: `MEESEEKS_HOST` moves the
Fastify server itself, which serves the built SPA with no Vite in the picture. See
[Project Setup](project-setup.md).
