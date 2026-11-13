import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { closePostizReturn } from './postiz-ui';

closePostizReturn();

createRoot(document.getElementById('root')!).render(<App />);
