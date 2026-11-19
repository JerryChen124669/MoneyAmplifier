// Shared UI pieces used by several views.
import { h, money, sum, periodKeyFor, periodLabel, shiftKey, today } from './util.js';import { getState, isTransfer } from './store.js';

/** Which month/period the Home and History tabs are showing (kept while you switch tabs). */
export const ui = { period: null };
export function currentPeriod() {
  return periodKeyFor(today(), getState().settings.startDay);
}
export function activePeriod() {
  if (!ui.period) ui.period = currentPeriod();
  return ui.period;
}

export function monthNav(onChange) {
  const { startDay } = getState().settings;
  const go = (delta) => { ui.period = shiftKey(activePeriod(), delta); onChange(); };
  return h('div', { class: 'month-nav' },
    h('button', { 'aria-label': 'Previous period', onClick: () => go(-1) }, '‹'),
    h('button', { class: 'month-label', 'aria-haspopup': 'dialog', onClick: () => openMonthPicker(onChange) },
      periodLabel(activePeriod(), startDay), h('span', { 'aria-hidden': 'true' }, ' ▾')),
    h('button', { 'aria-label': 'Next period', onClick: () => go(1) }, '›'));
}

/** Pop-up calendar: pick a year with ‹ ›, then tap a month. A dot marks months that have entries. */
function openMonthPicker(onChange) {
  const { startDay } = getState().settings;
  const selected = activePeriod();
  const now = currentPeriod();
  const used = new Set(getState().transactions.map((t) => periodKeyFor(t.date, startDay)));
  let year = Number(selected.slice(0, 4));

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const pick = (key) => { ui.period = key; close(); onChange(); };

  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Choose month' });
  const overlay = h('div', { class: 'sheet-backdrop', onClick: (e) => { if (e.target === overlay) close(); } }, panel);

  function draw() {
    panel.replaceChildren(
      h('div', { class: 'sheet-head' },
        h('button', { 'aria-label': 'Previous year', onClick: () => { year -= 1; draw(); } }, '‹'),
        h('strong', {}, String(year)),
        h('button', { 'aria-label': 'Next year', onClick: () => { year += 1; draw(); } }, '›')),
      h('div', { class: 'month-grid' }, Array.from({ length: 12 }, (_, i) => {
        const key = `${year}-${String(i + 1).padStart(2, '0')}`;
        const cls = [key === selected ? 'on' : '', key === now ? 'now' : '', used.has(key) ? 'has' : ''].join(' ').trim();
        return h('button', { class: cls, 'aria-pressed': key === selected ? 'true' : 'false', onClick: () => pick(key) },
          new Date(year, i, 1).toLocaleDateString(undefined, { month: 'short' }));
      })),
      startDay !== 1 ? h('p', { class: 'muted', style: 'margin:10px 4px 0' }, `Each month runs from day ${startDay} to day ${startDay - 1} of the next.`) : '',
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'grow', onClick: () => pick(now) }, 'This month'),
        h('button', { class: 'grow', onClick: close }, 'Close')));
  }
  draw();
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);
  const on = panel.querySelector('.month-grid .on');
  if (on) on.focus();
}

/** Second line of an ordinary transaction row: its note. */
export const txNote = (t) => t.note || '';

/** "💰 Cash → 📈 TSMC" (purchase) or "📈 TSMC → 💰 Cash" (cash-out): one line for money moving between cash and an investment. */
export function flowText(t) {
  const hold = t.investId && getState().investments.find((i) => i.id === t.investId);
  const name = hold ? hold.name : 'Investment';
  return t.type === 'expense' ? `💰 Cash → 📈 ${name}` : `📈 ${name} → 💰 Cash`;
}

export function txRow(t) {
  const { currency } = getState().settings;
  const sign = t.type === 'income' ? '+' : '−';
  if (isTransfer(t)) {
    // investment money flow: a single wide line instead of the usual two-line row
    return h('a', { class: 'tx transfer', href: `#/add/${t.id}` },
      h('div', { class: 'grow name' }, flowText(t), t.note ? h('span', { class: 'muted' }, ` · ${t.note}`) : null),
      h('div', { class: 'amt flow' }, sign + money(t.amount, currency)));
  }
  const note = txNote(t);
  return h('a', { class: 'tx', href: `#/add/${t.id}` },
    h('div', { class: 'grow' },
      h('div', { class: 'name' }, t.category || 'Uncategorised'),
      note ? h('div', { class: 'muted' }, note) : null),
    h('div', { class: `amt ${t.type}` }, sign + money(t.amount, currency)));
}

export const empty = (text) => h('div', { class: 'empty' }, text);

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/** Colours for charts (works in light and dark). */
export const PALETTE = ['#d9985f', '#8c5a3c', '#e9c9a0', '#7a9a7e', '#c27a52', '#e0b86b', '#a67c52', '#9db4a0', '#b56b4d', '#d4a59a', '#6e5b4a', '#f0d9b5'];

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

if (typeof Chart !== 'undefined') Chart.defaults.font.family = "'Nunito', ui-rounded, system-ui, sans-serif";

/**
 * Doughnut chart of [[label, value], ...] with percentages in the legend.
 * Returns { el, destroy } – call destroy() when the view is torn down or redrawn.
 */
export function donut(entries, currency) {
  const total = sum(entries, (e) => e[1]);
  const canvas = h('canvas');
  const el = h('div', { class: 'chart-box tall' }, canvas);
  let chart = null;
  if (typeof Chart !== 'undefined' && total > 0) {
    chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map((e) => `${e[0]} · ${Math.round((e[1] / total) * 100)}%`),
        datasets: [{ data: entries.map((e) => e[1]), backgroundColor: entries.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: cssVar('--surface'), borderWidth: 2 }],
      },
      options: {
        maintainAspectRatio: false, cutout: '58%',
        plugins: {
          legend: { position: 'bottom', labels: { color: cssVar('--text'), boxWidth: 12, padding: 10 } },
          tooltip: { callbacks: { label: (c) => ' ' + money(c.parsed, currency) } },
        },
      },
    });
  }
  return { el, destroy: () => chart && chart.destroy() };
}
