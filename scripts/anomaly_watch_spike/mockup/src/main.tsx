import '@homebrain/ui/tokens.css';
import '@homebrain/ui/fonts.css';
import '@homebrain/ui/components.css';
import './mock.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const theme = new URLSearchParams(location.search).get('theme') ?? 'dark';
document.documentElement.dataset.theme = theme;
createRoot(document.getElementById('root')!).render(<App />);
