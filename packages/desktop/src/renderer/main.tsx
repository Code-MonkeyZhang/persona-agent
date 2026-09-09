/**
 * @file src/renderer/main.tsx
 * @description 渲染进程入口，挂载 React 根组件到 DOM
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { setupGlobalErrorLogging } from './lib/logger';
import 'highlight.js/styles/github.css';
import './assets/styles/index.css';
import './i18n';

setupGlobalErrorLogging();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
