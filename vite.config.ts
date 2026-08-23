import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The dev server binds to loopback unless MEESEEKS_DEV_HOST names an interface
 * to expose it on — `make dev-tailnet` sets it to this host's tailnet address.
 *
 * Only Vite is exposed. The API server stays on 127.0.0.1 and is reached
 * through the proxy below, so exposing the UI does not also put the REST and
 * WebSocket surface on the network in its own right.
 *
 * The value is an address rather than a boolean on purpose: `host: true` binds
 * every interface, which would put an app with no authentication on whatever
 * LAN or hotspot the machine is also sitting on.
 */
const devHost = process.env.MEESEEKS_DEV_HOST;

/**
 * Host headers to accept when exposed. Vite rejects anything not listed, and
 * the three ways a browser can address this machine produce three different
 * headers:
 *
 *   100.x.y.z:5173                 an IP literal — allowed by Vite already
 *   quebox.tailfe19c7.ts.net:5173  matched by the `.ts.net` suffix entry
 *   quebox:5173                    matches neither, and needs naming outright
 *
 * The third is the one people actually type, because MagicDNS hands out the
 * tailnet suffix as a search domain. A leading dot is a suffix match in Vite,
 * so a bare hostname is never covered by one.
 *
 * MEESEEKS_DEV_ALLOWED_HOSTS is the escape hatch for a Tailscale machine name
 * that differs from the system hostname, which is the one case os.hostname()
 * gets wrong.
 */
function devAllowedHosts(): string[] {
  const extra = (process.env.MEESEEKS_DEV_ALLOWED_HOSTS ?? '')
    .split(',').map(h => h.trim()).filter(Boolean);
  return ['.ts.net', os.hostname(), ...extra];
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
    ...(devHost ? { host: devHost, allowedHosts: devAllowedHosts() } : {}),
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
