// Light / dark theme. 'auto' follows the phone's setting; 'light' and 'dark' are chosen by the user.
// The choice is kept in its own localStorage key so index.html can apply it before the page paints (no flash).
const KEY = 'moneyamplifier.theme';
const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch (e) { return 'auto'; }
}
export const isDark = () => (getTheme() === 'auto' ? !!(media && media.matches) : getTheme() === 'dark');

/** Put the theme on <html>, update the browser bar colour and the header button's icon. */
export function applyTheme() {
  const root = document.documentElement;
  const t = getTheme();
  if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || meta.content;
  const moon = document.getElementById('icon-moon'), sun = document.getElementById('icon-sun');
  if (moon && sun) { moon.style.display = isDark() ? 'none' : ''; sun.style.display = isDark() ? '' : 'none'; }
}

export function setTheme(t) {
  try {
    if (t === 'light' || t === 'dark') localStorage.setItem(KEY, t); else localStorage.removeItem(KEY);
  } catch (e) { /* storage blocked: the choice lasts until the page closes */ }
  applyTheme();
  window.dispatchEvent(new Event('theme-changed')); // charts read their colours when drawn, so the page redraws
}
export const toggleTheme = () => setTheme(isDark() ? 'light' : 'dark');

if (media && media.addEventListener) media.addEventListener('change', () => { if (getTheme() === 'auto') { applyTheme(); window.dispatchEvent(new Event('theme-changed')); } });
