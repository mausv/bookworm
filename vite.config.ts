import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const backend = 'http://localhost:3000'

export default defineConfig(({ isSsrBuild }) => ({
  root: resolve('./src/web'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve('./src') } },
  build: isSsrBuild
    ? {
        outDir: resolve('./dist/server'),
        emptyOutDir: true,
        rollupOptions: { input: resolve('./src/server/main.ts') },
      }
    : { outDir: resolve('./dist/web'), emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': backend, '/mcp': backend, '/.well-known': backend },
  },
}))
