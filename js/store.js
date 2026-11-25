// App state + persistence. Everything lives in one object saved to localStorage.
// To add a new kind of data later: add a field in defaults() and in sanitize().
import { uid, today } from './util.js';

const KEY = 'moneyamplifier.data.v1';

export const INVEST_TYPES = ['Stock', 'ETF', 'Bond', 'Fund', 'Crypto', 'Deposit', 'Other'];
export const TYPE_EMOJI = { Stock: '📈', ETF: '🧺', Bond: '🏛️', Fund: '🗂️', Crypto: '🪙', Deposit: '🏦', Other: '📦' };

/** Expenses in this category are purchases: they also create/increase a holding on the Invest page. */
export const INVEST_CATEGORY = '📈 Investment';
/** Income in this category is a cash-out: money coming back from a holding on the Invest page. */
export const INVEST_OUT_CATEGORY = '💵 Investment cash-out';
const OLD_INTEREST = '📈 Investments'; // income category renamed to Interest
const INTEREST = '📈 Interest';

/** Buying into / cashing out of an investment moves money between cash and investments; it is not spending or earning. */
export const isTransfer = (t) =>
  (t.type === 'expense' && t.category === INVEST_CATEGORY) || (t.type === 'income' && t.category === INVEST_OUT_CATEGORY);
/** Auto-priced holding: has a ticker and a number of shares/units, so its value = shares × latest price. */
export const isAuto = (i) => !!i.ticker && i.shares > 0;

// Accounts are the user's own bank accounts (typed in the first time, picked from a list afterwards).
// How a payment was made is a separate tag: cash, transfer or credit card.
const defaultAccounts = () => [{ id: 'main', name: 'Account', opening: 0 }];
export const METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'card', label: 'Credit card' },
];
export const methodLabel = (id) => (METHODS.find((m) => m.id === id) || { label: '' }).label;
const LEGACY_ACCOUNTS = { cash: 'cash', bank: 'transfer', card: 'card' }; // the first version of accounts used these as 'accounts'

export const defaults = () => ({
  version: 3,
  settings: { currency: 'TWD', startDay: 1, autoPrices: true, twelveKey: '', lastPriceRefresh: '', lastAccount: '', lastMethod: '' },
  categories: {
    expense: ['🍜 Food', '🛒 Groceries', '🚌 Transport', '🏠 Housing', '💡 Utilities', '🎬 Fun',
      '👕 Shopping', '💊 Health', '📚 Learning', '🎁 Gifts', '✈️ Travel', INVEST_CATEGORY, '📦 Other'],
    income: ['💼 Salary', '🎯 Bonus', INTEREST, INVEST_OUT_CATEGORY, '💰 Other income'],
  },
  accounts: defaultAccounts(), // { id, name, opening }
  // { id, date, type: 'expense'|'income', amount, category, account (id), method ('cash'|'transfer'|'card'|''), note, investId?, holdValue?, shares? }
  // investId = the holding on the Invest page this purchase / cash-out belongs to (Investment / cash-out categories only);
  // holdValue = how much the holding's value went up (purchase) or down (cash-out); shares = units bought / sold.
  transactions: [],
  // { id, name, type, institution, amount (current value), updated, ticker, shares, priceCur, price, priceDate }
  investments: [],
  valueLog: [],      // total investment value per day: { date, invest } (feeds the Net worth chart)
  profile: { debts: 0 }, // total debts (loans…), used for net worth
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
  const out = { ...d, settings: { ...d.settings }, categories: { ...d.categories }, profile: { ...d.profile }, accounts: [], transactions: [], investments: [], valueLog: [], netWorth: [] };

  const s = raw.settings || {};
  if (typeof s.currency === 'string' && /^[A-Z]{3}$/.test(s.currency)) out.settings.currency = s.currency;
  const sd = Math.round(num(s.startDay));
  if (sd >= 1 && sd <= 31) out.settings.startDay = sd;
  if (typeof s.autoPrices === 'boolean') out.settings.autoPrices = s.autoPrices;
  if (typeof s.twelveKey === 'string' && /^[\w-]{0,80}$/.test(s.twelveKey)) out.settings.twelveKey = s.twelveKey;
  if (isDate(s.lastPriceRefresh)) out.settings.lastPriceRefresh = s.lastPriceRefresh;

  // accounts. Older data: a single "daily account" (its starting balance becomes the account's), or the first version
  // of accounts where Cash / Bank / Credit card were accounts: those become ONE account, with the old account kept as the payment method.
  const p = raw.profile || {};
  const rawAccounts = [];
  if (Array.isArray(raw.accounts)) {
    const seen = new Set();
    for (const a of raw.accounts) {
      const name = str(a && a.name, 40).trim();
      const id = str(a && a.id, 40) || uid();
      if (!name || seen.has(id)) continue;
      seen.add(id);
      rawAccounts.push({ id, name, opening: Number.isFinite(num(a.opening)) ? num(a.opening) : 0 });
    }
  }
  const legacy = rawAccounts.length > 0 && rawAccounts.every((a) => LEGACY_ACCOUNTS[a.id]);
  const accountMap = {}; // old account id -> new account id
  const methodMap = {};  // old account id -> payment method
  if (legacy) {
    out.accounts = defaultAccounts();
    out.accounts[0].opening = rawAccounts.reduce((a, x) => a + x.opening, 0);
    rawAccounts.forEach((a) => { accountMap[a.id] = 'main'; methodMap[a.id] = LEGACY_ACCOUNTS[a.id]; });
  } else if (rawAccounts.length) {
    out.accounts = rawAccounts.map((a) => (a.name === '🏦 Account' ? { ...a, name: 'Account' } : a)); // the old default name had an emoji
  } else {
    out.accounts = defaultAccounts();
    if (Number.isFinite(num(p.openingCash))) out.accounts[0].opening = num(p.openingCash);
  }
  const accountIds = new Set(out.accounts.map((a) => a.id));
  const lastAcct = accountMap[s.lastAccount] || s.lastAccount;
  if (accountIds.has(lastAcct)) out.settings.lastAccount = lastAcct;
  if (METHODS.some((m) => m.id === s.lastMethod)) out.settings.lastMethod = s.lastMethod;

  for (const t of ['expense', 'income']) {
    const list = raw.categories && Array.isArray(raw.categories[t]) ? raw.categories[t] : null;
    if (list) out.categories[t] = [...new Set(list.map((c) => str(c, 40).trim()).filter(Boolean))];
  }
  // migrations: income "Investments" -> "Interest"; the Investment expense category must always exist
  out.categories.income = [...new Set(out.categories.income.map((c) => (c === OLD_INTEREST ? INTEREST : c)))];
  if (!out.categories.expense.includes(INVEST_CATEGORY)) out.categories.expense.push(INVEST_CATEGORY);
  if (!out.categories.income.includes(INVEST_OUT_CATEGORY)) out.categories.income.push(INVEST_OUT_CATEGORY);
  for (const t of Array.isArray(raw.transactions) ? raw.transactions : []) {
    const amount = num(t && t.amount);
    if (!t || !isDate(t.date) || !(t.type === 'expense' || t.type === 'income') || !(amount > 0)) continue;
    let category = str(t.category, 40);
    if (t.type === 'income' && category === OLD_INTEREST) category = INTEREST;
    const rec = {
      id: str(t.id, 40) || uid(), date: t.date, type: t.type, amount, category, note: str(t.note, 200),
      account: accountIds.has(accountMap[t.account] || t.account) ? (accountMap[t.account] || t.account) : out.accounts[0].id, // entries from before accounts existed go to the first one
      method: METHODS.some((m) => m.id === t.method) ? t.method : (methodMap[t.account] || ''),
    };
    if (isTransfer(rec) && t.investId) {
      rec.investId = str(t.investId, 40);
      if (num(t.holdValue) >= 0) rec.holdValue = num(t.holdValue);
      if (num(t.shares) > 0) rec.shares = num(t.shares);
    }
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
      ticker: str(i.ticker, 30).trim(),
      shares: num(i.shares) > 0 ? num(i.shares) : 0,
      priceCur: typeof i.priceCur === 'string' && /^[A-Z]{3}$/.test(i.priceCur) ? i.priceCur : '',
      price: num(i.price) > 0 ? num(i.price) : 0,
      priceDate: isDate(i.priceDate) ? i.priceDate : '',
    });
  }
  for (const v of Array.isArray(raw.valueLog) ? raw.valueLog : []) {
    if (v && isDate(v.date) && num(v.invest) >= 0) out.valueLog.push({ date: v.date, invest: num(v.invest) });
  }
  out.valueLog.sort((a, b) => a.date.localeCompare(b.date));
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

/** Keep one {date, invest} entry per day with the total investment value (for the Net worth chart). */
function stampValue(st) {
  if (!st.investments.length && !st.valueLog.length) return false;
  const total = Math.round(st.investments.reduce((a, i) => a + i.amount, 0) * 100) / 100;
  const d = today();
  const last = st.valueLog[st.valueLog.length - 1];
  if (last && last.date === d) {
    if (last.invest === total) return false;
    last.invest = total;
    return true;
  }
  st.valueLog.push({ date: d, invest: total });
  if (st.valueLog.length > 1500) st.valueLog.splice(0, st.valueLog.length - 1500);
  return true;
}

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
  stampValue(state);
  save();
  if (!silent) listeners.forEach((f) => f());
}

if (stampValue(state)) save();

export function replaceAll(newState) {
  state = sanitize(newState);
  stampValue(state);
  save();
  listeners.forEach((f) => f());
}

// ---- derived numbers shared by Home / Net worth ----
/** Inside update(): the id of the account with this name (case-insensitive), creating it the first time you type it. */
export function ensureAccount(st, name) {
  const clean = str(name, 40).trim();
  const found = st.accounts.find((a) => a.name.toLowerCase() === clean.toLowerCase());
  if (found) return found.id;
  const a = { id: uid(), name: clean, opening: 0 };
  st.accounts.push(a);
  return a.id;
}
export const accountName = (s, id) => (s.accounts.find((a) => a.id === id) || { name: 'Unknown account' }).name;
/** One account's balance = its starting balance + its income − its expenses (whatever the payment method). */
export function accountBalance(s, id) {
  const a = s.accounts.find((x) => x.id === id);
  return (a ? a.opening : 0) + s.transactions.reduce((sum, t) => (t.account === id ? sum + (t.type === 'income' ? t.amount : -t.amount) : sum), 0);
}
/** All accounts together. */
export function cashBalance(s = state) {
  return s.accounts.reduce((sum, a) => sum + a.opening, 0) + s.transactions.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
}
export const investTotal = (s = state) => s.investments.reduce((a, i) => a + i.amount, 0);
export function netWorthNow(s = state) {
  const cash = cashBalance(s), invest = investTotal(s), debts = s.profile.debts;
  return { cash, invest, debts, net: cash + invest - debts };
}

// ---- moving money between cash and investments ----
// A purchase is an Expense (cash goes down) that raises a holding by the same amount; a cash-out is an Income
// (cash goes up) that lowers the holding. Both are stored as normal transactions linked to the holding, so they show
// up in History / Home, and editing or deleting them puts the holding back the way it was.
const round = (v) => Math.round(v * 1e6) / 1e6;

function adjustHolding(hold, dValue, dShares) {
  hold.amount = Math.max(0, round(hold.amount + dValue));
  if (dShares || hold.shares) hold.shares = Math.max(0, round((hold.shares || 0) + dShares));
  hold.updated = today();
}

/** Inside update(): reverse what a linked transaction did to its holding (no-op if the holding was deleted). */
export function undoInvest(st, t) {
  const hold = t.investId && st.investments.find((i) => i.id === t.investId);
  if (!hold) return;
  const dir = t.type === 'expense' ? -1 : 1;
  adjustHolding(hold, dir * (t.holdValue ?? t.amount), dir * (t.shares || 0));
}

/**
 * Inside update(): apply `link` ({ pick, holdValue, shares }) for transaction `rec` and tag `rec` with the holding.
 * pick = { id } for an existing holding, or { name, type, institution, ticker } to create one (purchases only).
 */
function applyInvest(st, rec, link) {
  let hold = link.pick.id && st.investments.find((i) => i.id === link.pick.id);
  if (!hold) {
    if (rec.type !== 'expense') return;
    const type = INVEST_TYPES.includes(link.pick.type) ? link.pick.type : 'Other';
    hold = {
      id: uid(), name: str(link.pick.name, 60).trim(), type, institution: str(link.pick.institution, 60).trim(),
      amount: 0, updated: today(), ticker: str(link.pick.ticker, 30).trim(), shares: 0, priceCur: '', price: 0, priceDate: '',
    };
    st.investments.push(hold);
  }
  let value = link.holdValue, shares = link.shares || 0;
  if (rec.type === 'income') { value = Math.min(value, hold.amount); shares = Math.min(shares, hold.shares || 0); } // can't sell more than is held
  const dir = rec.type === 'expense' ? 1 : -1;
  adjustHolding(hold, dir * value, dir * shares);
  rec.investId = hold.id;
  rec.holdValue = value;
  if (shares > 0) rec.shares = shares; else delete rec.shares;
}

/** Inside update(): drop holdings (from `ids`) that are empty and that no transaction points at any more. */
function pruneHoldings(st, ids) {
  st.investments = st.investments.filter((i) => !ids.includes(i.id) || i.amount > 0 || (i.shares || 0) > 0 || st.transactions.some((t) => t.investId === i.id));
}

/**
 * Inside update(): save transaction `rec` (replacing `existing` if editing), keeping the Invest page in step.
 * `link` is null for ordinary entries, or { pick, holdValue, shares } for a purchase / cash-out.
 */
export function commitTx(st, rec, existing, link) {
  const touched = [];
  if (existing && existing.investId) { undoInvest(st, existing); touched.push(existing.investId); }
  delete rec.investId; delete rec.holdValue; delete rec.shares;
  if (link) applyInvest(st, rec, link);
  if (existing) st.transactions[st.transactions.findIndex((t) => t.id === existing.id)] = rec;
  else st.transactions.push(rec);
  pruneHoldings(st, touched);
}

/** Inside update(): delete a transaction and take its effect back out of the holding. */
export function removeTx(st, t) {
  st.transactions = st.transactions.filter((x) => x.id !== t.id);
  if (t.investId) { undoInvest(st, t); pruneHoldings(st, [t.investId]); }
}

// backups never include the price-service key
export const exportJSON = () => JSON.stringify({ ...state, settings: { ...state.settings, twelveKey: '' } }, null, 2);

function csv(rows) {
  const safe = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  return '﻿' + rows.map((r) => r.map(safe).join(',')).join('\r\n');
}
export function exportCSV() {
  const rows = [['date', 'account', 'method', 'type', 'category', 'amount', 'note']];
  [...state.transactions].sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) => rows.push([t.date, accountName(state, t.account), t.method, t.type, t.category, t.amount, t.note]));
  return csv(rows);
}
export function exportInvestmentsCSV() {
  const rows = [['name', 'type', 'institution', 'amount', 'updated']];
  state.investments.forEach((i) => rows.push([i.name, i.type, i.institution, i.amount, i.updated]));
  return csv(rows);
}
