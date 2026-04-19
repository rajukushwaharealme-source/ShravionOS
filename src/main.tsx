import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

const isProductionBuild = Boolean((import.meta as any).env?.PROD);

if ('serviceWorker' in navigator && isProductionBuild) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('ShravionOS service worker registration failed', error);
    });
  });
}
