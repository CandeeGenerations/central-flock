import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import {defineConfig} from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    },
  },
})
