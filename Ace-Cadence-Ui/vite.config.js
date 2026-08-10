import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-server proxy mirrors nginx's production routing (see
// Ace-Cadence/nginx/nginx.conf) so `npm run dev` talks to the same backend
// paths without a separate CORS setup. Point VITE_API_PROXY_TARGET at nginx
// (or an individual service) via .env.local if it's not on localhost.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:80';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'convex/react': fileURLToPath(new URL('./src/convexCompat/react.js', import.meta.url)),
    },
  },
  base: '/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/ws': { target: apiTarget, ws: true, changeOrigin: true },
    },
  },
});
