import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App-90s';
import './styles-90s.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
