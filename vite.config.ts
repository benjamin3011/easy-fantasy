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
            // 'firebase/messaging' - lazy loaded separately
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
      'firebase/functions'
      // 'firebase/messaging' - lazy loaded
    ]
  },
  plugins: [
    react(),
    svgr({
      svgrOptions: { icon: true, exportType: 'named', namedExport: 'ReactComponent' }
    }),
    VitePWA({
      registerType: 'prompt',
      devOptions: {
        enabled: true,    
        type: 'module',   
        navigateFallback: 'index.html'
      },
      strategies: 'injectManifest', // Changed to injectManifest for custom SW
      srcDir: 'src',
      filename: 'sw.ts', // Custom service worker file
      injectRegister: false,
      includeAssets: [
        'favicon.svg',
        'robots.txt',
        '/icons/favicon-96x96.png',
        '/icons/apple-icon-180.png',
        '/icons/manifest-icon-192.maskable.png',
        '/icons/manifest-icon-512.maskable.png',
        '/icons/manifest-icon-1024.maskable.png',
        '/images/logo/logo-new.svg',
        '/images/logo/logo-new-dark.svg'
      ],
      manifest: {
        name: 'Easy Fantasy',
        short_name: 'Easy Fantasy',
        start_url: './',  
        scope: './',      
        display: 'standalone',
        background_color: '#161950',
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
          },
          {
            src: '/icons/manifest-icon-1024.maskable.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'maskable any'
          }
        ]
      }
    })
  ]
})
