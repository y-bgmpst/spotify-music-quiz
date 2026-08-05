import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App-win95-desktop';
import './styles-win95-desktop.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
