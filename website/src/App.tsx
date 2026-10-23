import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Privacy from './pages/Privacy';

// 手册带整条 markdown 渲染链，懒加载隔离出落地页首屏。
const Docs = lazy(() => import('./pages/Docs'));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/docs"
        element={
          <Suspense fallback={null}>
            <Docs />
          </Suspense>
        }
      />
      <Route
        path="/docs/*"
        element={
          <Suspense fallback={null}>
            <Docs />
          </Suspense>
        }
      />
      <Route path="/privacy-policy" element={<Privacy />} />
      <Route path="/privacy-policy/" element={<Privacy />} />
      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}
