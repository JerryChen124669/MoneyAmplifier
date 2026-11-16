// App state + persistence. Everything lives in one object saved to localStorage.
// To add a new kind of data later: add a field in defaults() and in sanitize().
import { uid, today } from './util.js';

const KEY = 'moneyamplifier.data.v1';

export const INVEST_TYPES = ['Stock', 'ETF', 'Bond', 'Fund', 'Crypto', 'Deposit', 'Other'];
export const TYPE_EMOJI = { Stock: '📈', ETF: '🧺', Bond: '🏛️', Fund: '🗂️', Crypto: '🪙', Deposit: '🏦', Other: '📦' };

export const defaults = () => ({
  version: 2,
  settings: { currency: 'TWD', startDay: 1 },
  categories: {
    expense: ['🍜 Food', '🛒 Groceries', '🚌 Transport', '🏠 Housing', '💡 Utilities', '🎬 Fun',
      '👕 Shopping', '💊 Health', '📚 Learning', '🎁 Gifts', '✈️ Travel', '📦 Other'],
    income: ['💼 Salary', '🎯 Bonus', '📈 Investments', '💰 Other income'],
  },
  transactions: [],  // daily spending: { id, date, type: 'expense'|'income', amount, category, note }
  investments: [],   // { id, name, type, institution, amount (current value), updated }
  profile: { openingCash: 0, debts: 0 }, // daily-account starting balance + total debts, used for net worth
  netWorth: [],      // monthly snapshots: { id, month: 'YYYY-MM', cash, invest, debts }
});

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isMonth = (s) => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
const num = (v) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : NaN);
const str = (v, max = 80) => String(v ?? '').slice(0, max);

/** Turn untrusted data (saved file / import) into a valid state object. Throws if it's not usable. */
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a MoneyAmplifier backup.');
  const d = defaults();
  const out = { ...d, settings: { ...d.settings }, categories: { ...d.categories }, profile: { ...d.profile }, transactions: [], investments: [], netWorth: [] };

  const s = raw.settings || {};
  if (typeof s.currency === 'string' && /^[A-Z]{3}$/.test(s.currency)) out.settings.currency = s.currency;
  const sd = Math.round(num(s.startDay));
  if (sd >= 1 && sd <= 31) out.settings.startDay = sd;

  for (const t of ['expense', 'income']) {
    const list = raw.categories && Array.isArray(raw.categories[t]) ? raw.categories[t] : null;
    if (list) out.categories[t] = [...new Set(list.map((c) => str(c, 40).trim()).filter(Boolean))];
  }
  for (const t of Array.isArray(raw.transactions) ? raw.transactions : []) {
    const amount = num(t && t.amount);
    if (!t || !isDate(t.date) || !(t.type === 'expense' || t.type === 'income') || !(amount > 0)) continue;
    out.transactions.push({ id: str(t.id, 40) || uid(), date: t.date, type: t.type, amount, category: str(t.category, 40), note: str(t.note, 200) });
  }
  for (const i of Array.isArray(raw.investments) ? raw.investments : []) {
    const amount = num(i && i.amount);
    const name = str(i && i.name, 60).trim();
    if (!name || !(amount >= 0)) continue;
    out.investments.push({
      id: str(i.id, 40) || uid(), name, amount,
      type: INVEST_TYPES.includes(i.type) ? i.type : 'Other',
      institution: str(i.institution, 60).trim(),
      updated: isDate(i.updated) ? i.updated : today(),
    });
  }
  const p = raw.profile || {};
  if (Number.isFinite(num(p.openingCash))) out.profile.openingCash = num(p.openingCash);
  if (num(p.debts) >= 0) out.profile.debts = num(p.debts);

  for (const r of Array.isArray(raw.netWorth) ? raw.netWorth : []) {
    if (!r || !isMonth(r.month)) continue;
    // v1 snapshots had assets/liabilities; map them onto the new shape
    const cash = Number.isFinite(num(r.cash)) ? num(r.cash) : num(r.assets);
    const invest = num(r.invest) >= 0 ? num(r.invest) : 0;
    const debts = num(r.debts) >= 0 ? num(r.debts) : num(r.liabilities);
    if (!Number.isFinite(cash) || !(debts >= 0)) continue;
    out.netWorth.push({ id: str(r.id, 40) || uid(), month: r.month, cash, invest, debts });
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

// ---- derived numbers shared by Home / Net worth ----
/** Daily account balance = starting balance + all income − all expenses. */
export function cashBalance(s = state) {
  return s.profile.openingCash + s.transactions.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0);
}
export const investTotal = (s = state) => s.investments.reduce((a, i) => a + i.amount, 0);
export function netWorthNow(s = state) {
  const cash = cashBalance(s), invest = investTotal(s), debts = s.profile.debts;
  return { cash, invest, debts, net: cash + invest - debts };
}

export const exportJSON = () => JSON.stringify(state, null, 2);

function csv(rows) {
  const safe = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  return '﻿' + rows.map((r) => r.map(safe).join(',')).join('\r\n');
}
export function exportCSV() {
  const rows = [['date', 'type', 'category', 'amount', 'note']];
  [...state.transactions].sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) => rows.push([t.date, t.type, t.category, t.amount, t.note]));
  return csv(rows);
}
export function exportInvestmentsCSV() {
  const rows = [['name', 'type', 'institution', 'amount', 'updated']];
  state.investments.forEach((i) => rows.push([i.name, i.type, i.institution, i.amount, i.updated]));
  return csv(rows);
}
