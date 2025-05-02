// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    host: true,
    port: 4173,
    https: {
      key: './localhost+2-key.pem',
      cert: './localhost+2.pem'
    }
  },
  plugins: [
    react(),
    svgr({
      svgrOptions: { icon: true, exportType: 'named', namedExport: 'ReactComponent' }
    }),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,    // ← turn it on in dev so you can inspect the manifest tag
      },
      includeAssets: [
        'favicon.svg',
        'robots.txt',
        // make sure these files live in /public
        '/icons/favicon-96x96.png',
        '/icons/apple-icon-180.png',
        '/icons/manifest-icon-192.maskable.png',
        '/icons/manifest-icon-512.maskable.png',
        '/images/logo/logo-new.svg',
        '/images/logo/logo-new-dark.svg'
      ],
      manifest: {
        name: 'Easy Fantasy',
        short_name: 'Easy Fantasy',
        start_url: '.',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0B345A',
        icons: [
          {
            src: '/icons/manifest-icon-192.maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable any'
          },
          {
            src: '/icons/manifest-icon-512.maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable any'
          }
        ]
      },
      workbox: {
        // precache all your static files (js/css/html/png/svg/ico)
        globPatterns: [
          '**/*.{js,css,html,png,svg,ico,txt,webmanifest}'
        ],
        // force a new SW to take control
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|css|js)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache' }
          }
        ]
      }
    })
  ]
})
