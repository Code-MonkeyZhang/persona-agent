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
  // 手册的每个页面都预渲染一份壳，深链接直接返回 200 而不是走 404 兜底。
  plugins: [
    react(),
    prerenderRoutes([
      'privacy-policy',
      'docs',
      'getting-started/intro',
      'getting-started/install',
      'getting-started/first-run',
      'getting-started/model-access',
      'getting-started/first-chat',
      'agents/preset',
      'agents/create',
      'agents/context-memory',
      'agents/appearance',
      'agents/from-marketplace',
      'voice/setup',
      'voice/presets',
      'voice/cloning',
      'voice/playback',
      'agent-apps/concepts',
      'agent-apps/install',
      'agent-apps/personalize',
      'agent-apps/notifications',
      'mcp-tools/concepts',
      'mcp-tools/install',
      'mcp-tools/assign',
      'mcp-tools/builtin',
      'skills/concepts',
      'skills/install',
      'skills/assign',
      'remote/tunnel',
      'remote/pairing',
      'remote/devices',
      'remote/sync',
      'troubleshooting/environment',
      'troubleshooting/common',
      'troubleshooting/logs',
      'troubleshooting/support',
    ]),
  ],
  base: '/persona-agent/',
});
