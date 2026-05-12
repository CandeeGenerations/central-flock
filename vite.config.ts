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
        })
      : null,
  ],
  build: {
    // Emit source maps for Sentry; 'hidden' means they're produced but not referenced from the bundle.
    sourcemap: 'hidden',
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
      '/data/scan-images': 'http://localhost:5172',
      '/data/nursery-logos': 'http://localhost:5172',
    },
  },
})
