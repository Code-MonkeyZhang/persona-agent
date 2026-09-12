/**
 * @file src/renderer/main.tsx
 * @description 渲染进程入口，挂载 React 根组件到 DOM
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { setupGlobalErrorLogging } from './lib/logger';
import { initAppStorage } from './lib/appStorage';
import 'highlight.js/styles/github.css';
import './assets/styles/index.css';

setupGlobalErrorLogging();

/** 先整取应用状态再加载业务模块，存储读取发生在模块导入时，数据不就位会首帧跳变 */
async function bootstrap(): Promise<void> {
  await initAppStorage();
  await import('./i18n');
  const { default: App } = await import('./App');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
