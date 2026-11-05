import { createRoot } from 'react-dom/client';
import tokens from '@homebrain/ui/tokens.css?inline';
import components from '@homebrain/ui/components.css?inline';
import { injectPanelFonts } from '../shell/injectFonts';
import { Catalog } from './Catalog';
import catalogStyles from './catalog.css?inline';

// Dev-only vstup (catalog.html). Lib build panelu (src/index.ts) tento soubor nikdy neimportuje.
injectPanelFonts();
const style = document.createElement('style');
style.textContent = tokens + components + catalogStyles;
document.head.append(style);
createRoot(document.getElementById('catalog')!).render(<Catalog />);
