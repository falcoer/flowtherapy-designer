import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DEMO, installDemo, type DemoData } from './demo';
import './styles.css';

async function start() {
  if (DEMO) {
    // les données d'exemple ne sont chargées que dans la version démo
    // (fichier généré par `npm run build:demo`, absent des builds normaux)
    const json = import.meta.glob<{ default: unknown }>('./demo-data.json');
    const load = json['./demo-data.json'];
    if (!load) throw new Error('demo-data.json manquant : lancer npm run build:demo');
    await installDemo(() => load().then((m) => m.default as DemoData));
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
start();
