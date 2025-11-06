import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['vue', 'vue-router'],
          'firebase': ['firebase/app', 'firebase/storage'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/infosimples': {
        target: 'https://api.infosimples.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/infosimples/, ''),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[Proxy] Enviando requisição para Infosimples:', req.url)
          })
        }
      }
    }
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false }, // desabilita PWA em dev para evitar SW controlando localhost
      includeAssets: ['favicon.svg', 'favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'EventosSP 2.0',
        short_name: 'EventosSP',
        theme_color: '#4b72ff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})

