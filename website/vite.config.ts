import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const spaRedirect = (): Plugin => ({
  name: 'spa-redirect-for-github-pages',
  closeBundle() {
    const distDir = resolve(__dirname, 'dist');
    const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
    writeFileSync(resolve(distDir, '404.html'), indexHtml);
  },
});

export default defineConfig({
  plugins: [react(), spaRedirect()],
  base: '/persona-agent/',
});
