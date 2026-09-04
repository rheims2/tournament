import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// Vercel exposes the commit it built from; fall back to a local git read so a
// dev build is identifiable too. Surfaced in the app so anyone can tell which
// build their phone is actually running.
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  (() => {
    try {
      return execSync('git rev-parse --short HEAD').toString().trim()
    } catch {
      return 'dev'
    }
  })()

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Volleyball Tournament',
        short_name: 'VB Tourney',
        description: 'Pool play and bracket tracking for volleyball tournaments',
        theme_color: '#f2f5f9',
        background_color: '#f2f5f9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Scores must never come from cache -- only the app shell is precached.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
