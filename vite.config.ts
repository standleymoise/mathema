import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// base './' lets the build work on GitHub Pages under any repository name.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      // give every build its own service-worker cache name so old shells are dropped on update
      name: 'sw-build-id',
      apply: 'build',
      closeBundle() {
        const p = 'dist/sw.js'
        if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf8').replace('__BUILD_ID__', Date.now().toString(36)))
      },
    },
  ],
  build: { chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.mjs', 'server/eval/*.test.ts'], fileParallelism: false },
  server: { proxy: { '/api': 'http://localhost:3001' } },
})
