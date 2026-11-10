export { kitchenApi, type KitchenApi } from '@homebrain/ha-client';

/** Android app handoff; a visible return to the page cancels the browser fallback. */
export function openApp(url: string, fallback?: string): void {
  if (url.startsWith('https://')) {
    window.location.assign(url);
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (document.hidden && timer) {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', cancel);
    }
  };
  document.addEventListener('visibilitychange', cancel);
  if (fallback)
    timer = setTimeout(() => {
      document.removeEventListener('visibilitychange', cancel);
      if (!document.hidden) window.location.assign(fallback);
    }, 1800);
  else setTimeout(() => document.removeEventListener('visibilitychange', cancel), 2000);
  window.location.assign(url);
}
