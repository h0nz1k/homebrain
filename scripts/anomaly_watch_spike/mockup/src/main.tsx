import '@homebrain/ui/tokens.css';
import '@homebrain/ui/fonts.css';
import '@homebrain/ui/components.css';
import './mock.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const theme = new URLSearchParams(location.search).get('theme') ?? 'dark';
document.documentElement.dataset.theme = theme;

// Czech typography: one-letter words (v, s, z, k, o, u, a, i), number + unit ('2 h', '78 %'),
// 'od/do 9:29', ranges ('13–15 h') and 'Home Assistant' never break at a line end.
// In the panel this belongs to the copy layer; the mockup fixes rendered text.
const ONE_LETTER = /(?<=^|[\s(„])([vszkouaiVSZKOUAI]) /g;
const UNIT = /(\d) (?=h\b|min\b|%|°C|Kč|hodnot|zařízení|hlášení)/g;
const BEFORE_TIME = /(?<=\b(?:od|do|ve|za)) (?=\d)/g;
function tie(root: Node) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.nodeValue ?? '';
    const next = text
      .replace(ONE_LETTER, '$1\u00a0')
      .replace(UNIT, '$1\u00a0')
      .replace(BEFORE_TIME, '\u00a0')
      .replace(/(\d)–(?=\d)/g, '$1–\u2060')
      .replace(/Home Assistant/g, 'Home\u00a0Assistant');
    if (next !== text) n.nodeValue = next;
  }
}
const root = document.getElementById('root')!;
new MutationObserver(() => tie(root)).observe(root, {
  childList: true,
  subtree: true,
  characterData: true,
});
createRoot(root).render(<App />);
