import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // sur le serveur, l'atelier occupe la racine : l'ancien éditeur vit sous /editeur/
  base: process.env.VITE_DEMO === '1' ? '/' : '/editeur/',
  // démo : un seul bundle, intégrable dans une page autonome
  build: process.env.VITE_DEMO === '1' ? { outDir: 'dist-demo', rollupOptions: { output: { inlineDynamicImports: true } } } : {},
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4310', '/files': 'http://127.0.0.1:4310' },
  },
});
