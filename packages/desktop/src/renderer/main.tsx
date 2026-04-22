/**
 * @file src/renderer/main.tsx
 * @description 渲染进程入口，挂载 React 根组件到 DOM
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'highlight.js/styles/github.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
