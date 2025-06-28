// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Add base configuration for proper asset loading
  base: './',
  server: {
    host: '0.0.0.0', // Changed from true to explicit IP for better ngrok compatibility
    port: 4173,
    // Allow all hosts for ngrok and other tunnel services
    allowedHosts: true,
    // Add headers for ngrok compatibility
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    // Remove HTTPS when using ngrok - ngrok provides the HTTPS layer
    // https: {
    //   key: './192.168.178.178+3-key.pem',
    //   cert: './192.168.178.178+3.pem'
    // }
  },
  // Add build configuration for better compatibility
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    // Optimize chunking strategy for better performance
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          'react-vendor': ['react', 'react-dom', 'react-router'],
          'firebase-vendor': [
            'firebase/app',
            'firebase/auth', 
            'firebase/firestore',
            'firebase/functions',
            'firebase/messaging'
          ],
          'ui-vendor': [
            'react-hot-toast',
            'react-ios-pwa-prompt'
          ]
        }
      }
    },
    // Increase chunk size warning limit since we're optimizing
    chunkSizeWarningLimit: 1000,
    // Optimize for production
    minify: 'esbuild',
    target: 'es2020'
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom', 
      'react-router',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/functions',
      'firebase/messaging'
    ]
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
        type: 'module',   // Add module type for better compatibility
        navigateFallback: 'index.html'
      },
      // Add strategies for better ngrok compatibility
      strategies: 'generateSW',
      injectRegister: 'auto',
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
        start_url: './',  // Changed to relative path
        scope: './',      // Add scope for PWA
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0B345A',
        orientation: 'portrait-primary',
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
        // Add navigation fallback for SPA routing
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/_/, /\/[^/?]+\.[^/]+$/],
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
