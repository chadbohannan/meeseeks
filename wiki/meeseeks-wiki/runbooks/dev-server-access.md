# Reaching the Dev Server From Another Device

`make dev` binds the Vite dev server to every interface, so the UI answers to whatever
address the browser used to get here:

| URL | Reaches it from |
| --- | --- |
| `http://localhost:5173` | this machine |
| `http://quebox:5173` | this machine (Debian maps the hostname to `127.0.1.1`) |
| `http://quebox.local:5173` | a LAN device with mDNS |
| `http://100.x.y.z:5173` | anything on the tailnet |
| `http://quebox.tailfe19c7.ts.net:5173` | anything on the tailnet, by MagicDNS |

From another tailnet device the bare hostname works too — MagicDNS hands out the tailnet
suffix as a search domain.

## Understand the trust boundary

**Meeseeks has no authentication.** Anyone who can load the page can create tickets,
edit permission sets, and start agents that run with those permissions on *this*
machine. It is a remote-code-execution surface by design, so **the network the machine
is on is the entire boundary**. That is fine on a home LAN or a personal tailnet, and it
is not fine on conference wifi or a café hotspot.

Two ways to tighten it, in increasing order of effort:

**Narrow the bind.** `MEESEEKS_DEV_HOST` takes an address and the dev server uses it
instead of the wildcard:

```
MEESEEKS_DEV_HOST=$(tailscale ip -4) make dev   # tailnet only
MEESEEKS_DEV_HOST=127.0.0.1 make dev            # this machine only
```

Binding one address has costs worth knowing before reaching for it: `localhost` stops
working when you bind the tailnet address, the bare hostname stops working too (it
resolves to `127.0.1.1`, which is no longer bound), and a tailnet address that changes
needs a restart because the address is read once at startup. The wildcard has none of
those problems, which is why it is the default.

**Firewall the port.** Leave the wildcard bind and let the host firewall decide which
interfaces may reach 5173 — for example `ufw allow in on tailscale0 to any port 5173`
under a default-deny input policy. This keeps every convenience above while moving the
boundary somewhere it can be stated once and audited.

## What is not exposed

Only Vite. The API server keeps binding to `127.0.0.1:5174` and is reached through
Vite's `/api` and `/ws` proxy, so exposing the UI does not separately publish the REST
and WebSocket surface:

```
ss -ltn | grep 517
LISTEN  127.0.0.1:5174      # API server — loopback
LISTEN  0.0.0.0:5173        # Vite
```

Nothing here touches production, which serves the built SPA from the Fastify server
itself and has its own `MEESEEKS_HOST`. See [Project Setup](project-setup.md).

## The host check, and why a bare hostname needs naming

Binding widely makes Vite's `allowedHosts` the remaining line of defence: it is what
stops a hostile page from pointing its own domain at this address and driving the dev
server through a visitor's browser. It rejects any `Host` header not listed, and each
way of addressing the machine sends a different one.

A leading dot is a **suffix** match, so `.ts.net` covers the MagicDNS FQDN but never the
bare `quebox` — that one has to be named outright, which `vite.config.ts` does with
`os.hostname()`. Getting this wrong produces

```
Blocked request. This host ("quebox") is not allowed.
```

while the IP and the FQDN keep working, which reads like a DNS fault and is not one.
`.ts.net` and `.local` are both safe as suffix entries: neither can be registered by
someone standing up a rebinding domain.

For anything else — an `/etc/hosts` alias, or a Tailscale machine name that differs from
the system hostname — set `MEESEEKS_DEV_ALLOWED_HOSTS=name1,name2`.

## Exposure on the tailnet is not the same as exposure to the internet

A `100.x` address is CGNAT space and is not routable from the internet, and a
`*.ts.net` MagicDNS name resolves through Tailscale's resolver rather than public DNS.
Two opt-in settings change that: enabling HTTPS certificates publishes machine and
tailnet names to public DNS and Certificate Transparency logs, and `tailscale funnel`
puts a port on the public internet. Neither is on by default —
`tailscale status --json` reports `CertDomains: null` and `tailscale funnel status`
reports no config when they are off.
