import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const prerenderRoutes = (routes: string[]): Plugin => ({
  name: 'prerender-spa-routes-for-github-pages',
  closeBundle() {
    const distDir = resolve(__dirname, 'dist');
    const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
    writeFileSync(resolve(distDir, '404.html'), indexHtml);
    for (const route of routes) {
      const routeDir = resolve(distDir, route);
      mkdirSync(routeDir, { recursive: true });
      writeFileSync(resolve(routeDir, 'index.html'), indexHtml);
    }
  },
});

export default defineConfig({
  plugins: [react(), prerenderRoutes(['privacy-policy'])],
  base: '/persona-agent/',
});
