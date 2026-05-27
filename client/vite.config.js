import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';

export default defineConfig(({ mode }) => {
  // Charger les variables d'environnement
  const env = loadEnv(mode, process.cwd(), '');

  // Déterminer l'URL de l'API (utilise variable d'environnement ou fallback localhost)
  const apiUrl = env.VITE_API_URL || 'http://localhost:3000';
  const livekitUrl = env.VITE_LIVEKIT_URL || 'ws://localhost:7880';

  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      injectRegister: 'auto',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'PTT Live',
        short_name: 'PTT Live',
        description: 'Professional WebRTC Intercom for Event Technicians',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.livekit\.cloud\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'livekit-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true,
    https: {
      key: fs.readFileSync('./localhost+3-key.pem'),
      cert: fs.readFileSync('./localhost+3.pem'),
    },
    proxy: {
      '/api': {
        target: apiUrl.startsWith('/') ? 'http://localhost:3000' : apiUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/livekit': {
        target: livekitUrl,
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/livekit/, '')
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
  };
});
