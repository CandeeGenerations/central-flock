import {sentryVitePlugin} from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import {defineConfig} from 'vite'

// Source maps are uploaded to Sentry on build when SENTRY_AUTH_TOKEN is set.
// Run as: SENTRY_RELEASE=$(git rev-parse --short HEAD) pnpm build
const sentryEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sentryEnabled
      ? sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT_WEB ?? 'central-flock-web',
          authToken: process.env.SENTRY_AUTH_TOKEN,
          release: {name: process.env.SENTRY_RELEASE},
          sourcemaps: {assets: './dist/**'},
          // The upload report is ~20 lines of debug-id tables on every deploy
          // and nobody reads it; failures still surface as build errors.
          silent: true,
          telemetry: false,
        })
      : null,
  ],
  build: {
    // Emit source maps for Sentry; 'hidden' means they're produced but not referenced from the bundle.
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // Group the lazy pages into one chunk per sub-app rather than one per page, so
        // opening any devotions page fetches the devotions cluster once instead of a
        // round trip per navigation within it. There is no service worker (see
        // docs/adr/0036-ios-relaunch-restore-not-prevent.md), so every chunk boundary is
        // a real tunnel request the first time it is crossed.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'charts'
            return undefined
          }
          const match = id.match(/\/src\/pages\/([^/]+)\//)
          if (!match) return undefined
          const cluster = match[1]
          if (cluster === 'schedules-settings' || cluster === 'attendance-settings') return 'settings-panes'
          return `page-${cluster}`
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    allowedHosts: ['flock.cgen.cc'],
    proxy: {
      '/api': 'http://localhost:5172',
      '/uploads': 'http://localhost:5172',
    },
  },
})
