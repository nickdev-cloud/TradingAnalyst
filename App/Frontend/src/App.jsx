import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Trades from './pages/Trades';
import Layout from './components/Layout';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/trades" element={<Trades />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
