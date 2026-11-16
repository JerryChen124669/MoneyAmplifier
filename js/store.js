// App state + persistence. Everything lives in one object saved to localStorage.
// To add a new kind of data later: add a field in defaults() and (optionally) in sanitize().
import { uid } from './util.js';

const KEY = 'moneyamplifier.data.v1';

export const defaults = () => ({
  version: 1,
  settings: { currency: 'TWD', startDay: 1 },
  categories: {
    expense: ['🍜 Food', '🛒 Groceries', '🚌 Transport', '🏠 Housing', '💡 Utilities', '🎬 Fun',
      '👕 Shopping', '💊 Health', '📚 Learning', '🎁 Gifts', '✈️ Travel', '📦 Other'],
    income: ['💼 Salary', '🎯 Bonus', '📈 Investments', '💰 Other income'],
  },
  budgets: {},       // { categoryName: monthlyLimit }
  transactions: [],  // { id, date, type: 'expense'|'income', amount, category, note }
  netWorth: [],      // { id, month: 'YYYY-MM', assets, liabilities }
});

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isMonth = (s) => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
const str = (v, max = 80) => String(v ?? '').slice(0, max);

/** Turn untrusted data (saved file / import) into a valid state object. Throws if it's not usable. */
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a MoneyAmplifier backup.');
  const d = defaults();
  const out = { version: 1, settings: { ...d.settings }, categories: { ...d.categories }, budgets: {}, transactions: [], netWorth: [] };

  const s = raw.settings || {};
  if (typeof s.currency === 'string' && /^[A-Z]{3}$/.test(s.currency)) out.settings.currency = s.currency;
  const sd = Math.round(num(s.startDay));
  if (sd >= 1 && sd <= 31) out.settings.startDay = sd;

  for (const t of ['expense', 'income']) {
    const list = raw.categories && Array.isArray(raw.categories[t]) ? raw.categories[t] : null;
    if (list) out.categories[t] = [...new Set(list.map((c) => str(c, 40).trim()).filter(Boolean))];
  }
  for (const [k, v] of Object.entries(raw.budgets || {})) {
    const n = num(v);
    if (n > 0) out.budgets[str(k, 40)] = n;
  }
  for (const t of Array.isArray(raw.transactions) ? raw.transactions : []) {
    const amount = num(t && t.amount);
    if (!t || !isDate(t.date) || !(t.type === 'expense' || t.type === 'income') || !(amount > 0)) continue;
    out.transactions.push({ id: str(t.id, 40) || uid(), date: t.date, type: t.type, amount, category: str(t.category, 40), note: str(t.note, 200) });
  }
  for (const r of Array.isArray(raw.netWorth) ? raw.netWorth : []) {
    if (!r || !isMonth(r.month) || isNaN(num(r.assets)) || isNaN(num(r.liabilities))) continue;
    out.netWorth.push({ id: str(r.id, 40) || uid(), month: r.month, assets: num(r.assets), liabilities: num(r.liabilities) });
  }
  return out;
}

function load() {
  try {
    const text = localStorage.getItem(KEY);
    if (text) return sanitize(JSON.parse(text));
  } catch (e) {
    console.warn('Could not read saved data, starting fresh.', e);
  }
  return defaults();
}

let state = load();
const listeners = new Set();

export const getState = () => state;
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    alert('Could not save: browser storage is full or blocked.');
  }
}

/** Change the state: update(s => { s.transactions.push(...) }). Pass {silent:true} to skip re-rendering. */
export function update(fn, { silent = false } = {}) {
  fn(state);
  save();
  if (!silent) listeners.forEach((f) => f());
}

export function replaceAll(newState) {
  state = sanitize(newState);
  save();
  listeners.forEach((f) => f());
}

export const exportJSON = () => JSON.stringify(state, null, 2);

export function exportCSV() {
  const safe = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [['date', 'type', 'category', 'amount', 'note']];
  [...state.transactions].sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) => rows.push([t.date, t.type, t.category, t.amount, t.note]));
  return '﻿' + rows.map((r) => r.map(safe).join(',')).join('\r\n');
}
