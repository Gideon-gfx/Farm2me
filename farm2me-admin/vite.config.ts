import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))

// PostCSS + Tailwind are configured inline with absolute content globs so the
// dev server applies Tailwind correctly even when launched from a different cwd
// (the preview runner starts vite from the monorepo root).
export default defineConfig({
  root,
  base: '/admin/',
  server: {
    port: 5266,
    strictPort: true,
    // Vite's dev-server HMR client needs to know it's served under /admin so
    // its websocket + asset requests go through the web app's proxy correctly.
    hmr: { path: '/admin/@hmr' },
  },
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          content: [resolve(root, 'index.html'), resolve(root, 'src/**/*.{ts,tsx}')],
          theme: {
            extend: {
              colors: {
                primary: '#1E5631',
                'primary-dark': '#16401F',
                accent: '#FFB800',
                muted: '#6C757D',
              },
            },
          },
          plugins: [],
        }),
        autoprefixer(),
      ],
    },
  },
})
