# Serving the Dev UI on a Tailnet

`make dev` binds to loopback, which is right for a tool that supervises agents on the
machine running it. To drive the same dev server from a phone or another laptop on
your tailnet:

```
make dev-tailnet
```

It binds the Vite dev server to this host's Tailscale address and prints the URL:

```
Meeseeks dev UI: http://100.x.y.z:5173  (tailnet only, unauthenticated)
```

From any device on the tailnet the bare hostname is enough — `http://quebox:5173` —
because MagicDNS hands out the tailnet suffix as a search domain. The FQDN
(`http://quebox.tailfe19c7.ts.net:5173`) is the same thing spelled out, useful on a
device whose resolver is not using that search domain. The address is also reachable
from the machine itself, so nothing is lost by binding there instead of loopback;
`http://localhost:5173` is simply not the URL any more.

That `.ts.net` name is internal, not a public hostname. It resolves through Tailscale's
resolver to a `100.64.0.0/10` CGNAT address, which is not routable from the internet —
so even a name that leaked reaches nothing. Two settings change that and both are
opt-in: enabling HTTPS certificates publishes machine and tailnet names to public DNS
and Certificate Transparency logs (`tailscale status --json` shows `CertDomains: null`
when it is off), and `tailscale funnel` is the only feature that puts a port on the
public internet.

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

## If your tailnet address changes

The address is looked up fresh on every `make dev-tailnet` — `TAILSCALE_IP` is a
recursive Make variable, so `tailscale ip -4` runs when the target runs, and nothing is
cached between invocations. Restarting is all it takes to pick up a new address.
(Recursive rather than `:=` on purpose: `:=` would shell out to `tailscale` while
parsing the Makefile, making every `make test` pay for it.)

It is not re-discovered *while running*. Vite binds once at startup, so an address that
changes mid-session leaves a listening socket on an address the host no longer has;
restart the target.

Neither failure is silent. With `tailscaled` down, `tailscale ip -4` returns nothing and
the target stops on its own guard. With an address the host does not hold, the kernel
refuses the bind:

```
Error: listen EADDRNOTAVAIL: address not available 100.99.99.99:5173
```

In practice a node's 100.x address is stable — it survives reboots, wifi-to-cellular
moves, and going offline and back. It changes when the node is removed and re-authed,
issued a new machine key, or moved to a different tailnet. **Bookmark the MagicDNS name
rather than the IP**: MagicDNS follows the node, so a saved link keeps working across a
change that would strand an IP bookmark.

For a setup that never needs a restart, `tailscale serve` (below) is the answer —
tailscaled owns the address and Vite never binds to it at all.

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

Vite rejects `Host` headers it was not told about, and the three ways to address this
machine produce three different headers, each needing its own coverage:

| URL | Host header | Why it is allowed |
| --- | --- | --- |
| `http://100.x.y.z:5173` | `100.x.y.z:5173` | Vite allows IP literals already |
| `http://quebox.tailfe19c7.ts.net:5173` | the FQDN | the `.ts.net` suffix entry |
| `http://quebox:5173` | `quebox:5173` | named outright via `os.hostname()` |

The last one is the trap: a leading dot in `allowedHosts` is a *suffix* match, so
`.ts.net` never covers a bare hostname — and the bare hostname is what people type,
since MagicDNS supplies the suffix as a search domain. Missing it produces
`Blocked request. This host ("quebox") is not allowed.` from Vite while the IP and the
FQDN both work, which reads like a DNS problem and is not one.

If your Tailscale machine name differs from the system hostname, `os.hostname()` guesses
wrong; set `MEESEEKS_DEV_ALLOWED_HOSTS=name1,name2` to add names explicitly.

Production has its own seam and does not use this one: `MEESEEKS_HOST` moves the
Fastify server itself, which serves the built SPA with no Vite in the picture. See
[Project Setup](project-setup.md).
