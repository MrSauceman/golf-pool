import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths so the build works from a domain root or a GitHub Pages
  // subpath (…/golf-pool/) without rebuilding. The app uses hash routing, so no
  // server-side rewrite is needed for deep links.
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
  },
});
