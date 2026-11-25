// App state + persistence. Everything lives in one object saved to localStorage.
// To add a new kind of data later: add a field in defaults() and in sanitize().
import { uid, today } from './util.js';

const KEY = 'moneyamplifier.data.v1';

// The type keys are what is saved (so old data keeps working); TYPE_LABEL is what is shown.
export const INVEST_TYPES = ['Stock', 'ETF', 'Bond', 'Fund', 'Crypto', 'Deposit', 'Other'];
export const TYPE_EMOJI = { Stock: '📈', ETF: '🧺', Bond: '🏛️', Fund: '🗂️', Crypto: '🪙', Deposit: '🏦', Other: '📦' };
export const TYPE_LABEL = { Stock: '股票', ETF: 'ETF', Bond: '債券', Fund: '基金', Crypto: '加密貨幣', Deposit: '存款', Other: '其他' };

/** Expenses in this category are purchases: they also create/increase a holding on the Invest page. */
export const INVEST_CATEGORY = '📈 投資';
/** Income in this category is a cash-out: money coming back from a holding on the Invest page. */
export const INVEST_OUT_CATEGORY = '💵 投資贖回';
const INTEREST = '📈 利息';
// the app used to be in English: saved data with these category names is renamed when it loads
const CATEGORY_RENAMES = {
  '🍜 Food': '🍜 餐飲', '🛒 Groceries': '🛒 超市', '🚌 Transport': '🚌 交通', '🏠 Housing': '🏠 居住', '💡 Utilities': '💡 水電',
  '🎬 Fun': '🎬 娛樂', '👕 Shopping': '👕 購物', '💊 Health': '💊 醫療', '📚 Learning': '📚 學習', '🎁 Gifts': '🎁 禮物',
  '✈️ Travel': '✈️ 旅遊', '📦 Other': '📦 其他', '📈 Investment': INVEST_CATEGORY,
  '💼 Salary': '💼 薪水', '🎯 Bonus': '🎯 獎金', '📈 Interest': INTEREST, '📈 Investments': INTEREST, '💵 Investment cash-out': INVEST_OUT_CATEGORY, '💰 Other income': '💰 其他收入',
};
const renameCategory = (c) => CATEGORY_RENAMES[c] || c;

/** Interest the bank charged on a credit card: an expense that is added to the card's bill. */
export const CARD_INTEREST = '💳 信用卡利息';
// fixed (rent, bills…) vs variable (food, fun…) spending. What you picked last for a category is remembered in settings.catKind.
export const KINDS = [{ id: 'fixed', label: '固定' }, { id: 'variable', label: '浮動' }];
const FIXED_DEFAULT = ['🏠 居住', '💡 水電'];
export const kindOf = (s, t) => t.kind || (s.settings.catKind || {})[t.category] || (FIXED_DEFAULT.includes(t.category) ? 'fixed' : 'variable');
export const defaultKind = (s, category) => (s.settings.catKind || {})[category] || (FIXED_DEFAULT.includes(category) ? 'fixed' : 'variable');
/** Category shown for any transaction (account-to-account transfers have none). */
export const catOf = (t) => (t.type === 'transfer' ? '🔁 轉帳' : t.category || '未分類');
/** + for money in, − for money out, 0 for a transfer between your own accounts (what a day / group "net" adds up). */
export const signed = (t) => (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0);

/** Buying into / cashing out of an investment moves money between cash and investments; it is not spending or earning. */
export const isTransfer = (t) =>
  (t.type === 'expense' && t.category === INVEST_CATEGORY) || (t.type === 'income' && t.category === INVEST_OUT_CATEGORY);
/** Auto-priced holding: has a ticker and a number of shares/units, so its value = shares × latest price. */
export const isAuto = (i) => !!i.ticker && i.shares > 0;

// Accounts are the user's own bank accounts (typed in the first time, picked from a list afterwards).
// How a payment was made is a separate tag: cash, transfer or credit card.
const DEFAULT_ACCOUNT = '帳戶';
const defaultAccounts = () => [{ id: 'main', name: DEFAULT_ACCOUNT, opening: 0 }];
export const METHODS = [
  { id: 'cash', label: '現金' },
  { id: 'transfer', label: '轉帳' },
  { id: 'card', label: '信用卡' },
];
export const methodLabel = (id) => (METHODS.find((m) => m.id === id) || { label: '' }).label;
const LEGACY_ACCOUNTS = { cash: 'cash', bank: 'transfer', card: 'card' }; // the first version of accounts used these as 'accounts'

export const defaults = () => ({
  version: 4,
  settings: {
    currency: 'TWD', startDay: 1, autoPrices: true, twelveKey: '', lastPriceRefresh: '', lastAccount: '', lastMethod: '', lastCard: '',
    catKind: {},       // category -> 'fixed' | 'variable' (remembered from the last entry)
    incomeOverride: 0, // wish list: monthly income to use instead of the average from your entries (0 = automatic)
    workDays: 22, workHours: 8, // wish list: working days per month, hours per day
  },
  categories: {
    expense: ['🍜 餐飲', '🛒 超市', '🚌 交通', '🏠 居住', '💡 水電', '🎬 娛樂',
      '👕 購物', '💊 醫療', '📚 學習', '🎁 禮物', '✈️ 旅遊', INVEST_CATEGORY, CARD_INTEREST, '📦 其他'],
    income: ['💼 薪水', '🎯 獎金', INTEREST, INVEST_OUT_CATEGORY, '💰 其他收入'],
  },
  accounts: defaultAccounts(), // { id, name, opening }
  // credit cards: { id, name, closingDay, dueDay, apr (% per year), account (id that pays the bill), opening (already owed), limit, interestDate }
  cards: [],
  wishes: [], // wish list: { id, name, price, note, done }
  // { id, date, type: 'expense'|'income'|'transfer', amount, category, account (id), method ('cash'|'transfer'|'card'|''), note, investId?, holdValue?, shares? }
  // expense: kind ('fixed'|'variable'); card (id) = put on that credit card's bill instead of paying from the account (owed until a payment is made)
  // transfer: account -> toAccount (id) or toCard (id; a credit-card payment). Not spending, not income.
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
  if (!raw || typeof raw !== 'object') throw new Error('這不是 MoneyAmplifier 的備份檔。');
  const d = defaults();
  const out = { ...d, settings: { ...d.settings, catKind: {} }, categories: { ...d.categories }, profile: { ...d.profile }, accounts: [], cards: [], wishes: [], transactions: [], investments: [], valueLog: [], netWorth: [] };

  const s = raw.settings || {};
  if (typeof s.currency === 'string' && /^[A-Z]{3}$/.test(s.currency)) out.settings.currency = s.currency;
  const sd = Math.round(num(s.startDay));
  if (sd >= 1 && sd <= 31) out.settings.startDay = sd;
  if (typeof s.autoPrices === 'boolean') out.settings.autoPrices = s.autoPrices;
  if (typeof s.twelveKey === 'string' && /^[\w-]{0,80}$/.test(s.twelveKey)) out.settings.twelveKey = s.twelveKey;
  if (isDate(s.lastPriceRefresh)) out.settings.lastPriceRefresh = s.lastPriceRefresh;
  if (s.catKind && typeof s.catKind === 'object') {
    for (const [c, k] of Object.entries(s.catKind)) if (KINDS.some((x) => x.id === k)) out.settings.catKind[str(c, 40)] = k;
  }
  if (num(s.incomeOverride) >= 0) out.settings.incomeOverride = num(s.incomeOverride);
  const wd = Math.round(num(s.workDays)), wh = num(s.workHours);
  if (wd >= 1 && wd <= 31) out.settings.workDays = wd;
  if (wh > 0 && wh <= 24) out.settings.workHours = wh;

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
    out.accounts = rawAccounts.map((a) => (a.name === '🏦 Account' || a.name === 'Account' ? { ...a, name: DEFAULT_ACCOUNT } : a)); // the old English default names
  } else {
    out.accounts = defaultAccounts();
    if (Number.isFinite(num(p.openingCash))) out.accounts[0].opening = num(p.openingCash);
  }
  const accountIds = new Set(out.accounts.map((a) => a.id));
  const lastAcct = accountMap[s.lastAccount] || s.lastAccount;
  if (accountIds.has(lastAcct)) out.settings.lastAccount = lastAcct;
  if (METHODS.some((m) => m.id === s.lastMethod)) out.settings.lastMethod = s.lastMethod;

  // credit cards (the account that pays the bill falls back to the first account)
  for (const c of Array.isArray(raw.cards) ? raw.cards : []) {
    const name = str(c && c.name, 40).trim();
    if (!name) continue;
    const day = (v, fallback) => { const n = Math.round(num(v)); return n >= 1 && n <= 31 ? n : fallback; };
    out.cards.push({
      id: str(c.id, 40) || uid(), name,
      closingDay: day(c.closingDay, 5), dueDay: day(c.dueDay, 20),
      apr: num(c.apr) >= 0 && num(c.apr) <= 100 ? num(c.apr) : 15,
      account: accountIds.has(c.account) ? c.account : out.accounts[0].id,
      opening: num(c.opening) >= 0 ? num(c.opening) : 0,
      limit: num(c.limit) > 0 ? num(c.limit) : 0,
      interestDate: isDate(c.interestDate) ? c.interestDate : '',
    });
  }
  const cardIds = new Set(out.cards.map((c) => c.id));
  if (cardIds.has(s.lastCard)) out.settings.lastCard = s.lastCard;

  for (const w of Array.isArray(raw.wishes) ? raw.wishes : []) {
    const name = str(w && w.name, 60).trim();
    if (!name || !(num(w.price) > 0)) continue;
    out.wishes.push({ id: str(w.id, 40) || uid(), name, price: num(w.price), note: str(w.note, 100), done: w.done === true });
  }

  for (const t of ['expense', 'income']) {
    const list = raw.categories && Array.isArray(raw.categories[t]) ? raw.categories[t] : null;
    if (list) out.categories[t] = [...new Set(list.map((c) => str(c, 40).trim()).filter(Boolean))];
  }
  // migrations: English default names -> Chinese; the Investment categories must always exist
  for (const t of ['expense', 'income']) out.categories[t] = [...new Set(out.categories[t].map(renameCategory))];
  if (!out.categories.expense.includes(INVEST_CATEGORY)) out.categories.expense.push(INVEST_CATEGORY);
  if (!out.categories.income.includes(INVEST_OUT_CATEGORY)) out.categories.income.push(INVEST_OUT_CATEGORY);
  if (!(raw.version >= 4) && Array.isArray(raw.categories && raw.categories.expense) && !out.categories.expense.includes(CARD_INTEREST)) {
    out.categories.expense.push(CARD_INTEREST);
  }
  for (const t of Array.isArray(raw.transactions) ? raw.transactions : []) {
    const amount = num(t && t.amount);
    if (!t || !isDate(t.date) || !(t.type === 'expense' || t.type === 'income' || t.type === 'transfer') || !(amount > 0)) continue;
    if (t.type === 'transfer') {
      // between your own accounts, or a payment to a credit card
      if (!accountIds.has(t.account)) continue;
      const rec = { id: str(t.id, 40) || uid(), date: t.date, type: 'transfer', amount, category: '', note: str(t.note, 200), account: t.account, method: '' };
      if (cardIds.has(t.toCard)) rec.toCard = t.toCard;
      else if (accountIds.has(t.toAccount) && t.toAccount !== t.account) rec.toAccount = t.toAccount;
      else continue;
      out.transactions.push(rec);
      continue;
    }
    const category = renameCategory(str(t.category, 40));
    const rec = {
      id: str(t.id, 40) || uid(), date: t.date, type: t.type, amount, category, note: str(t.note, 200),
      account: accountIds.has(accountMap[t.account] || t.account) ? (accountMap[t.account] || t.account) : out.accounts[0].id, // entries from before accounts existed go to the first one
      method: METHODS.some((m) => m.id === t.method) ? t.method : (methodMap[t.account] || ''),
    };
    if (rec.type === 'expense') {
      if (!isTransfer(rec) && KINDS.some((k) => k.id === t.kind)) rec.kind = t.kind;
      if (cardIds.has(t.card)) { rec.card = t.card; rec.method = 'card'; }
    }
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
    alert('無法儲存：瀏覽器儲存空間已滿或被封鎖。');
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
export const accountName = (s, id) => (s.accounts.find((a) => a.id === id) || { name: '未知帳戶' }).name;
/**
 * How a transaction changes the money in one bank account (`acct` = its id) or in all accounts together ('all').
 *  - income / expense paid from the account: +/− amount
 *  - expense put on a credit card: 0 (nothing leaves the account until the bill is paid)
 *  - transfer between accounts: − from the source, + to the destination (0 for all accounts together)
 *  - payment to a credit card: − from the paying account
 */
export function txEffect(t, acct) {
  if (t.type === 'transfer') {
    if (acct === 'all') return t.toCard ? -t.amount : 0;
    return (t.account === acct ? -t.amount : 0) + (t.toAccount === acct ? t.amount : 0);
  }
  if (t.card) return 0;
  if (acct !== 'all' && t.account !== acct) return 0;
  return t.type === 'income' ? t.amount : -t.amount;
}
/** One account's balance = its starting balance + everything that moved in or out of it. */
export function accountBalance(s, id) {
  const a = s.accounts.find((x) => x.id === id);
  return (a ? a.opening : 0) + s.transactions.reduce((sum, t) => sum + txEffect(t, id), 0);
}
/** All accounts together. */
export function cashBalance(s = state) {
  return s.accounts.reduce((sum, a) => sum + a.opening, 0) + s.transactions.reduce((sum, t) => sum + txEffect(t, 'all'), 0);
}
export const investTotal = (s = state) => s.investments.reduce((a, i) => a + i.amount, 0);
export function netWorthNow(s = state) {
  const cash = cashBalance(s), invest = investTotal(s), cardDebt = cardsPayable(s), debts = s.profile.debts + cardDebt;
  return { cash, invest, debts, cardDebt, net: cash + invest - debts };
}

// ---- credit cards ----
// A card purchase is an expense with `card` set. It is counted as spending on the day you made it, but no bank account
// changes: it becomes accounts payable. Paying the bill is a transfer (account -> toCard) that clears the payable, so
// the money is never counted as spending twice. Interest the bank charges is recorded as one more expense on the card.
const pad2 = (n) => String(n).padStart(2, '0');
const clampDay = (y, m, d) => Math.min(d, new Date(y, m, 0).getDate()); // m = 1..12
const nextYM = (y, m) => (m === 12 ? [y + 1, 1] : [y, m + 1]);
const dayStr = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

/** Which bill a charge made on `date` lands on: its key (the closing month), closing date and due date. */
export function statementOf(card, date) {
  let [y, m, d] = date.split('-').map(Number);
  if (d > clampDay(y, m, card.closingDay)) [y, m] = nextYM(y, m);
  const close = dayStr(y, m, clampDay(y, m, card.closingDay));
  const [dy, dm] = card.dueDay > card.closingDay ? [y, m] : nextYM(y, m);
  return { key: `${y}-${pad2(m)}`, close, due: dayStr(dy, dm, clampDay(dy, dm, card.dueDay)) };
}

/**
 * Everything about one card: its bills (newest first), what is owed, what is not billed yet, and the next due date.
 * Payments are applied to the oldest bill first. Status per bill: 'unbilled' | 'due' | 'overdue' | 'paid'.
 */
export function cardSummary(s, card, todayStr = today()) {
  const charges = s.transactions.filter((t) => t.card === card.id);
  const payments = s.transactions.filter((t) => t.type === 'transfer' && t.toCard === card.id).sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map();
  if (card.opening > 0) map.set('opening', { key: 'opening', close: '', due: '', charges: card.opening, items: [] });
  for (const t of charges) {
    const st = statementOf(card, t.date);
    if (!map.has(st.key)) map.set(st.key, { ...st, charges: 0, items: [] });
    const e = map.get(st.key);
    e.charges += t.amount;
    e.items.push(t);
  }
  const list = [...map.values()].sort((a, b) => (a.key === 'opening' ? -1 : b.key === 'opening' ? 1 : a.close.localeCompare(b.close)));
  let left = payments.reduce((a, t) => a + t.amount, 0);
  const totalPaid = left;
  for (const st of list) {
    st.paid = Math.min(st.charges, left);
    left -= st.paid;
    st.unpaid = st.charges - st.paid;
    const closed = !st.close || todayStr > st.close;
    st.status = !closed ? 'unbilled' : st.unpaid <= 0.005 ? 'paid' : todayStr > st.due && st.due ? 'overdue' : 'due';
  }
  const sumOf = (f) => list.filter(f).reduce((a, st) => a + st.unpaid, 0);
  const unbilled = sumOf((st) => st.status === 'unbilled');
  const billed = sumOf((st) => st.status === 'due' || st.status === 'overdue');
  const nextDue = list.find((st) => st.status === 'due' || st.status === 'overdue') || null;
  // interest estimate on overdue bills: unpaid × yearly rate × days late, counted from the due date or from the last time you recorded interest
  const interestEst = list.filter((st) => st.status === 'overdue').reduce((a, st) => {
    const from = card.interestDate && card.interestDate > st.due ? card.interestDate : st.due;
    return a + (st.unpaid * (card.apr / 100) * Math.max(0, daysBetween(from, todayStr))) / 365;
  }, 0);
  return {
    statements: [...list].reverse(), payments: [...payments].reverse(), totalPaid,
    payable: unbilled + billed - left, // a negative number means you paid ahead
    unbilled, billed, credit: left, nextDue, interestEst,
    available: card.limit > 0 ? card.limit - (unbilled + billed - left) : null,
  };
}
export const cardsPayable = (s = state) => s.cards.reduce((a, c) => a + cardSummary(s, c).payable, 0);

/** Inside update(): delete a card. Its purchases become normal spending from the account, and its payments are dropped (same total effect). */
export function removeCard(st, id) {
  st.transactions = st.transactions.filter((t) => t.toCard !== id);
  st.transactions.forEach((t) => { if (t.card === id) delete t.card; });
  st.cards = st.cards.filter((c) => c.id !== id);
  if (st.settings.lastCard === id) st.settings.lastCard = '';
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
  const rows = [['日期', '帳戶', '付款方式', '類型', '類別', '固定／浮動', '信用卡／轉入', '金額', '備註']];
  const cardName = (id) => (state.cards.find((c) => c.id === id) || { name: '' }).name;
  [...state.transactions].sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) => rows.push([
      t.date, accountName(state, t.account), methodLabel(t.method),
      t.type === 'income' ? '收入' : t.type === 'transfer' ? '轉帳' : '支出', t.type === 'transfer' ? '' : t.category,
      t.type === 'expense' && !isTransfer(t) ? KINDS.find((k) => k.id === kindOf(state, t)).label : '',
      t.type === 'transfer' ? (t.toCard ? cardName(t.toCard) + '（繳款）' : accountName(state, t.toAccount)) : cardName(t.card),
      t.amount, t.note]));
  return csv(rows);
}
export function exportInvestmentsCSV() {
  const rows = [['名稱', '類型', '機構', '金額', '更新日期']];
  state.investments.forEach((i) => rows.push([i.name, TYPE_LABEL[i.type] || i.type, i.institution, i.amount, i.updated]));
  return csv(rows);
}
