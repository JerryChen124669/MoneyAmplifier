// Shared UI pieces used by several views.
import { h, money, sum, periodKeyFor, periodLabel, shiftKey, today } from './util.js';
import { getState, isTransfer, accountName, METHODS, methodLabel } from './store.js';

/**
 * What Home, History and Profile are showing (kept while you switch tabs):
 * period = which month, account = 'all' or one account id, flow = 'expense' | 'income' (Home charts).
 */
export const ui = { period: null, account: 'all', flow: 'expense' };
/** The account being viewed; falls back to 'all' if that account no longer exists. */
export function activeAccount() {
  if (ui.account !== 'all' && !getState().accounts.some((a) => a.id === ui.account)) ui.account = 'all';
  return ui.account;
}
export const inAccount = (t) => activeAccount() === 'all' || t.account === ui.account;

/** Chips: All accounts + one per account. Picking one changes what the charts and lists show. */
export function accountPicker(onChange, { label = '帳戶' } = {}) {
  const sel = activeAccount();
  const chip = (id, text) => h('button', { class: `chip ${sel === id ? 'on' : ''}`, 'aria-pressed': sel === id ? 'true' : 'false', onClick: () => { ui.account = id; onChange(); } }, text);
  return h('div', { class: 'acct-picker', role: 'group', 'aria-label': label },
    chip('all', '所有帳戶'), getState().accounts.map((a) => chip(a.id, a.name)));
}
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
    h('button', { 'aria-label': '上一期', onClick: () => go(-1) }, '‹'),
    h('button', { class: 'month-label', 'aria-haspopup': 'dialog', onClick: () => openMonthPicker(onChange) },
      periodLabel(activePeriod(), startDay), h('span', { 'aria-hidden': 'true' }, ' ▾')),
    h('button', { 'aria-label': '下一期', onClick: () => go(1) }, '›'));
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

  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': '選擇月份' });
  const overlay = h('div', { class: 'sheet-backdrop', onClick: (e) => { if (e.target === overlay) close(); } }, panel);

  function draw() {
    panel.replaceChildren(
      h('div', { class: 'sheet-head' },
        h('button', { 'aria-label': '上一年', onClick: () => { year -= 1; draw(); } }, '‹'),
        h('strong', {}, String(year)),
        h('button', { 'aria-label': '下一年', onClick: () => { year += 1; draw(); } }, '›')),
      h('div', { class: 'month-grid' }, Array.from({ length: 12 }, (_, i) => {
        const key = `${year}-${String(i + 1).padStart(2, '0')}`;
        const cls = [key === selected ? 'on' : '', key === now ? 'now' : '', used.has(key) ? 'has' : ''].join(' ').trim();
        return h('button', { class: cls, 'aria-pressed': key === selected ? 'true' : 'false', onClick: () => pick(key) },
          new Date(year, i, 1).toLocaleDateString('zh-TW', { month: 'short' }));
      })),
      startDay !== 1 ? h('p', { class: 'muted', style: 'margin:10px 4px 0' }, `每個月從 ${startDay} 日算到下個月 ${startDay - 1} 日。`) : '',
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'grow', onClick: () => pick(now) }, '本月'),
        h('button', { class: 'grow', onClick: close }, '關閉')));
  }
  draw();
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);
  const on = panel.querySelector('.month-grid .on');
  if (on) on.focus();
}

/**
 * Which bank account: a text box that suggests accounts you typed before (like the institution box on the Invest page),
 * plus one-tap chips for them. Typing a new name creates the account when the entry is saved. Uses f.accountName.
 */
export function accountField(f, { label = '帳戶' } = {}) {
  const s = getState();
  const listId = 'account-suggestions';
  const same = (name) => f.accountName.trim().toLowerCase() === name.toLowerCase();
  const chips = s.accounts.map((a) => h('button', {
    type: 'button', class: 'chip', onClick: () => { f.accountName = a.name; input.value = a.name; sync(); },
  }, a.name));
  const sync = () => chips.forEach((c, i) => c.classList.toggle('on', same(s.accounts[i].name)));
  const input = h('input', {
    type: 'text', maxlength: '40', list: listId, autocomplete: 'off', placeholder: '輸入帳戶，例如：富邦銀行',
    value: f.accountName, onInput: (e) => { f.accountName = e.target.value; sync(); },
  });
  sync();
  return h('div', { class: 'stack' },
    h('label', { class: 'field' }, label, input, h('datalist', { id: listId }, s.accounts.map((a) => h('option', { value: a.name })))),
    s.accounts.length ? h('div', { class: 'chips' }, chips) : null);
}

/** How it was paid: Cash / Transfer / Credit card (income: Cash / Transfer). Uses f.method; tap the chosen one again to clear it. */
export function methodField(f, { income = false, label = '付款方式' } = {}) {
  const list = income ? METHODS.filter((m) => m.id !== 'card') : METHODS;
  const chips = list.map((m) => h('button', {
    type: 'button', class: 'chip', onClick: () => { f.method = f.method === m.id ? '' : m.id; sync(); },
  }, m.label));
  const sync = () => chips.forEach((c, i) => { c.classList.toggle('on', f.method === list[i].id); c.setAttribute('aria-pressed', f.method === list[i].id ? 'true' : 'false'); });
  sync();
  return h('div', {}, h('div', { class: 'muted', style: 'font-weight:700;margin:2px 0 6px' }, label), h('div', { class: 'chips' }, chips));
}

/** Second line of an ordinary transaction row: its note. */
export const txNote = (t) => t.note || '';

/**
 * Money moving between cash and an investment, as one wide row that shows BOTH sides:
 *   purchase:  💰 Cash −30,000  →  📈 TSMC +30,000
 *   cash-out:  📈 TSMC −50,000  →  💰 Cash +55,000   (the two can differ: the difference is profit)
 * `meta` is an optional small line under it (e.g. the date); the entry's note is added after it.
 */
export function flowRow(t, { meta = '' } = {}) {
  const { currency } = getState().settings;
  const hold = t.investId && getState().investments.find((i) => i.id === t.investId);
  const buy = t.type === 'expense';
  const invAmount = t.holdValue ?? t.amount;
  const cash = { label: accountName(getState(), t.account), amount: buy ? -t.amount : t.amount };
  const inv = { label: `${hold ? hold.name : '投資'}`, amount: buy ? invAmount : -invAmount };
  const side = (x, cls) => h('div', { class: `flow-side ${cls}` },
    h('div', { class: 'flow-name' }, x.label),
    h('div', { class: `flow-amt ${x.amount < 0 ? 'expense' : 'income'}` }, (x.amount < 0 ? '−' : '+') + money(Math.abs(x.amount), currency)));
  const [from, to] = buy ? [cash, inv] : [inv, cash];
  const extra = [meta, methodLabel(t.method), t.note].filter(Boolean).join(' · ');
  return h('a', { class: 'tx transfer flow', href: `#/add/${t.id}` },
    side(from, 'from'), h('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, '→'), side(to, 'to'),
    extra ? h('div', { class: 'flow-meta muted' }, extra) : null);
}

export function txRow(t) {
  const { currency } = getState().settings;
  const sign = t.type === 'income' ? '+' : '−';
  if (isTransfer(t)) return flowRow(t);
  const sub = [accountName(getState(), t.account), methodLabel(t.method), txNote(t)].filter(Boolean).join(' · ');
  return h('a', { class: 'tx', href: `#/add/${t.id}` },
    h('div', { class: 'grow' },
      h('div', { class: 'name' }, t.category || '未分類'),
      h('div', { class: 'muted' }, sub)),
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
export const PALETTE = ['#c4745a', '#5f9a82', '#d6a347', '#5f7fa6', '#b9617a', '#8a76ad', '#4f9aa3', '#a7a04f', '#c98b6b', '#7b8590', '#d08aa0', '#79a35d'];

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
