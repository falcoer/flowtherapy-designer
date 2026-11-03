import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // un seul bundle : la démo tient dans une page autonome
  build: { outDir: 'dist', assetsInlineLimit: 1e7, rollupOptions: { output: { inlineDynamicImports: true } } },
  server: { port: 5174 },
});
