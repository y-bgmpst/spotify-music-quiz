import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The packaged (Windows portable) build is served by FastAPI below /frontend/,
// so every asset URL emitted into dist/index.html must be prefixed accordingly.
// Without this, index.html references /assets/... and the browser gets 404s.
export default defineConfig({
  base: '/frontend/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // Playwright specs live under tests/e2e and are not run by Vitest.
    exclude: ['tests/e2e/**', 'node_modules/**'],
    restoreMocks: true,
  },
});
