// Router + app shell. Each tab is a module in js/views/ exporting { title, render(root, arg) }.
// To add a page: create js/views/foo.js, import it below, add it to `routes`, and add a link in index.html.
import { subscribe } from './store.js';
import * as home from './views/home.js';
import * as history from './views/history.js';
import * as add from './views/add.js';
import * as budget from './views/budget.js';
import * as wealth from './views/wealth.js';
import * as settings from './views/settings.js';

const routes = { home, history, add, budget, wealth, settings };
const root = document.getElementById('view');
let cleanup = null;

function render() {
  const [, name = 'home', arg] = location.hash.slice(1).split('/');
  const view = routes[name] || home;
  const tab = routes[name] ? name : 'home';

  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  root.replaceChildren();
  document.getElementById('page-title').textContent = view.title;
  document.title = view.title === 'MoneyAmplifier' ? 'MoneyAmplifier' : `${view.title} · MoneyAmplifier`;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  try {
    cleanup = view.render(root, arg) || null;
  } catch (e) {
    console.error(e);
    root.textContent = 'Something went wrong showing this page.';
  }
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
subscribe(render); // any saved change re-draws the current page
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
