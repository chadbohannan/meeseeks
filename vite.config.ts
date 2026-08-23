import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
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

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Tailscale's MagicDNS name is what a browser on the tailnet actually
    // sends as Host; Vite rejects hosts it was not told about.
    ...(devHost ? { host: devHost, allowedHosts: ['.ts.net'] } : {}),
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
