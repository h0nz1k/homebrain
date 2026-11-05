import interLatin200 from '@fontsource/inter/files/inter-latin-200-normal.woff2?url&no-inline';
import interLatinExt200 from '@fontsource/inter/files/inter-latin-ext-200-normal.woff2?url&no-inline';
import interLatin400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url&no-inline';
import interLatinExt400 from '@fontsource/inter/files/inter-latin-ext-400-normal.woff2?url&no-inline';
import interLatin500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url&no-inline';
import interLatinExt500 from '@fontsource/inter/files/inter-latin-ext-500-normal.woff2?url&no-inline';
import interLatin600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url&no-inline';
import interLatinExt600 from '@fontsource/inter/files/inter-latin-ext-600-normal.woff2?url&no-inline';
import interLatin700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url&no-inline';
import interLatinExt700 from '@fontsource/inter/files/inter-latin-ext-700-normal.woff2?url&no-inline';

const FONTS_STYLE_ID = 'homebrain-panel-fonts';

const latinRange =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const latinExtRange =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

const faces: { weight: number; url: string; range: string }[] = [
  { weight: 200, url: interLatinExt200, range: latinExtRange },
  { weight: 200, url: interLatin200, range: latinRange },
  { weight: 400, url: interLatinExt400, range: latinExtRange },
  { weight: 400, url: interLatin400, range: latinRange },
  { weight: 500, url: interLatinExt500, range: latinExtRange },
  { weight: 500, url: interLatin500, range: latinRange },
  { weight: 600, url: interLatinExt600, range: latinExtRange },
  { weight: 600, url: interLatin600, range: latinRange },
  { weight: 700, url: interLatinExt700, range: latinExtRange },
  { weight: 700, url: interLatin700, range: latinRange },
];

function faceRule(weight: number, url: string, range: string) {
  return `@font-face{font-family:Inter;font-style:normal;font-display:swap;font-weight:${weight};src:url('${url}') format('woff2');unicode-range:${range};}`;
}

export function injectPanelFonts(): void {
  if (document.getElementById(FONTS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FONTS_STYLE_ID;
  style.textContent = faces.map(({ weight, url, range }) => faceRule(weight, url, range)).join('');
  document.head.append(style);
}

export function panelFontFaceCss(): string {
  return faces.map(({ weight, url, range }) => faceRule(weight, url, range)).join('');
}
