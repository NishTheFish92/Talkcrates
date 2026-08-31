import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this repo at /talkcrates/, not the domain root —
  // without this, the built index.html would link to /assets/... and 404.
  base: '/talkcrates/',
})
