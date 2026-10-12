import { defineConfig } from 'vite';

// base './' permite desplegar tanto en la raíz (Vercel/Netlify) como en una
// subruta (GitHub Pages: https://usuario.github.io/andes-cafe/)
export default defineConfig({
  base: './',
  build: { outDir: 'dist', sourcemap: false },
});
