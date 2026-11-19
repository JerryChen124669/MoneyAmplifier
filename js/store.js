// App state + persistence. Everything lives in one object saved to localStorage.
// To add a new kind of data later: add a field in defaults() and in sanitize().
import { uid, today } from './util.js';

const KEY = 'moneyamplifier.data.v1';

export const INVEST_TYPES = ['Stock', 'ETF', 'Bond', 'Fund', 'Crypto', 'Deposit', 'Other'];
export const TYPE_EMOJI = { Stock: '📈', ETF: '🧺', Bond: '🏛️', Fund: '🗂️', Crypto: '🪙', Deposit: '🏦', Other: '📦' };

/** Expenses in this category are purchases: they also create/increase a holding on the Invest page. */
export const INVEST_CATEGORY = '📈 Investment';
const OLD_INTEREST = '📈 Investments'; // income category renamed to Interest
const INTEREST = '📈 Interest';

export const defaults = () => ({
  version: 2,
  settings: { currency: 'TWD', startDay: 1 },
  categories: {
    expense: ['🍜 Food', '🛒 Groceries', '🚌 Transport', '🏠 Housing', '💡 Utilities', '🎬 Fun',
      '👕 Shopping', '💊 Health', '📚 Learning', '🎁 Gifts', '✈️ Travel', INVEST_CATEGORY, '📦 Other'],
    income: ['💼 Salary', '🎯 Bonus', INTEREST, '💰 Other income'],
  },
  // daily account: { id, date, type: 'expense'|'income', amount, category, note, investId? }
  // investId = the Invest-page holding this purchase went into (only for the Investment category)
  transactions: [],
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
  // migrations: income "Investments" -> "Interest"; the Investment expense category must always exist
  out.categories.income = [...new Set(out.categories.income.map((c) => (c === OLD_INTEREST ? INTEREST : c)))];
  if (!out.categories.expense.includes(INVEST_CATEGORY)) out.categories.expense.push(INVEST_CATEGORY);
  for (const t of Array.isArray(raw.transactions) ? raw.transactions : []) {
    const amount = num(t && t.amount);
    if (!t || !isDate(t.date) || !(t.type === 'expense' || t.type === 'income') || !(amount > 0)) continue;
    let category = str(t.category, 40);
    if (t.type === 'income' && category === OLD_INTEREST) category = INTEREST;
    const rec = { id: str(t.id, 40) || uid(), date: t.date, type: t.type, amount, category, note: str(t.note, 200) };
    if (t.type === 'expense' && category === INVEST_CATEGORY && t.investId) rec.investId = str(t.investId, 40);
    out.transactions.push(rec);
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

// ---- buying investments through the Expense form ----
// Cash goes down (the expense) and the holding goes up by the same amount, so net worth stays the same.
const round = (v) => Math.round(v * 1e6) / 1e6;

/** Inside update(): add `amount` to an existing holding ({id}) or create a new one ({name,type,institution}). Returns its id. */
export function buyHolding(st, pick, amount) {
  let hold = pick.id && st.investments.find((i) => i.id === pick.id);
  if (hold) {
    hold.amount = round(hold.amount + amount);
    hold.updated = today();
  } else {
    hold = {
      id: uid(), name: str(pick.name, 60).trim(), amount: round(amount), updated: today(),
      type: INVEST_TYPES.includes(pick.type) ? pick.type : 'Other', institution: str(pick.institution, 60).trim(),
    };
    st.investments.push(hold);
  }
  return hold.id;
}
/** Inside update(): take a purchase transaction's amount back out of its holding. */
export function undoBuy(st, t) {
  const hold = t.investId && st.investments.find((i) => i.id === t.investId);
  if (!hold) return;
  hold.amount = Math.max(0, round(hold.amount - t.amount));
  hold.updated = today();
}
/** Inside update(): drop holdings (from `ids`) that are now empty and have no purchase left pointing at them. */
export function pruneHoldings(st, ids) {
  st.investments = st.investments.filter((i) => !ids.includes(i.id) || i.amount > 0 || st.transactions.some((t) => t.investId === i.id));
}

export const exportJSON =() => JSON.stringify(state, null, 2);

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
