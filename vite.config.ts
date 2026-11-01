import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built site live in any folder, such as GitHub Pages at /repo-name/.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { sourcemap: false, target: 'es2022' }
});
