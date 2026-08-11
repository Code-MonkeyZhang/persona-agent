import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Privacy from './pages/Privacy';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/privacy-policy" element={<Privacy />} />
      <Route path="/privacy-policy/" element={<Privacy />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
