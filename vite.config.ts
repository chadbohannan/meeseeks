import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The dev server binds every interface by default, so it answers to whatever
 * the browser used to reach this machine: localhost, the bare hostname (which
 * Debian maps to 127.0.1.1), the LAN address, or a tailnet address.
 *
 * Only Vite is exposed. The API server stays on 127.0.0.1 and is reached
 * through the proxy below, so this does not also put the REST and WebSocket
 * surface on the network in its own right.
 *
 * Meeseeks has no authentication and starts agents that run with real
 * permissions on this machine, so the network it is on is the whole boundary.
 * MEESEEKS_DEV_HOST narrows the bind when that boundary is not good enough —
 * `MEESEEKS_DEV_HOST=$(tailscale ip -4) make dev` serves the tailnet and
 * nothing else, and `MEESEEKS_DEV_HOST=127.0.0.1 make dev` serves only this
 * machine.
 */
const devHost = process.env.MEESEEKS_DEV_HOST ?? '0.0.0.0';

/**
 * Host headers to accept. Vite rejects anything not listed, which is what stops
 * a hostile page from pointing its own domain at this address and driving the
 * dev server through the visitor's browser. Binding widely makes that check the
 * remaining line, so it stays on.
 *
 * Each way of addressing the machine produces a different header, and a leading
 * dot is a *suffix* match — which is why the bare hostname has to be named
 * outright and is not covered by any of the suffix entries:
 *
 *   localhost:5173 / 100.x.y.z:5173     allowed by Vite already
 *   quebox.tailfe19c7.ts.net:5173       `.ts.net`
 *   quebox.local:5173                   `.local`, for mDNS on a LAN
 *   quebox:5173                         os.hostname()
 *
 * Both suffixes are safe to allow: neither `ts.net` nor mDNS `.local` can be
 * registered by someone setting up a rebinding domain.
 *
 * MEESEEKS_DEV_ALLOWED_HOSTS covers the rest — an /etc/hosts alias, or a
 * Tailscale machine name that differs from the system hostname.
 */
function devAllowedHosts(): string[] {
  const extra = (process.env.MEESEEKS_DEV_ALLOWED_HOSTS ?? '')
    .split(',').map(h => h.trim()).filter(Boolean);
  return ['.ts.net', '.local', os.hostname(), ...extra];
}

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: devHost,
    allowedHosts: devAllowedHosts(),
    proxy: {
      '/api': 'http://localhost:5174',
      '/ws': { target: 'ws://localhost:5174', ws: true },
    },
  },
  resolve: {
    alias: {
      '@web': path.resolve(__dirname, 'src/web'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
