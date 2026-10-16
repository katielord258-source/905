import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { supabaseConfigMissing } from './lib/supabase';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseConfigMissing ? (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontSize: '1.125rem', color: '#1e293b' }}>
        Не заданы переменные VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в настройках хостинга
      </div>
    ) : (
      <App />
    )}
  </StrictMode>
);
