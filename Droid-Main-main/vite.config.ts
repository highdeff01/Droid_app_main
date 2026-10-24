import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// SECURITY.md: the API is a privileged control plane, so dev and preview bind to
// loopback by default; DEV_HOST/HOST opt in to another interface explicitly.
const bindHost = process.env.DEV_HOST || process.env.HOST || '127.0.0.1';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: '/',
          name: 'Sightline Mobile Automation & Remote Vision HUD',
          short_name: 'Sightline',
          description: 'Autonomous Vision & Differential Mobile HUD with High-Res Sync and Automation Controller.',
          theme_color: '#020617',
          background_color: '#020617',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/mobile-remote',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MB limit
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      {
        name: 'api-server-middleware',
        async configureServer(server) {
          const { createServer } = await import('./server/index');
          const { pingAiEndpoint } = await import('./server/ai-status');
          const apiApp = createServer();
          void pingAiEndpoint();
          server.middlewares.use((req, res, next) => {
            if (req.url?.startsWith('/api')) {
              apiApp(req as any, res as any, (err: any) => {
                if (err) {
                  // Keep internals server-side; the client only gets a generic message.
                  console.error(`[api] Unhandled error on ${req.method} ${req.url}:`, err);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Internal server error' }));
                } else if (!res.writableEnded) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Not found', path: req.url }));
                }
              });
            } else {
              next();
            }
          });
        },
      },
    ],
    build: { outDir: "dist/spa" },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './client'),
        '@shared': path.resolve(__dirname, './shared'),
      },
    },
    server: {
      port: 3000,
      strictPort: true, // Prevents Vite from silently shifting to port 3001/3002 on collision
      host: bindHost,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // File watching is deactivated when DISABLE_HMR is true to save CPU and avoid intermediate rebuilds.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      host: bindHost,
    },
  };
});
