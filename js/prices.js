// Automatic prices for holdings that have a ticker and a number of shares/units.
//   Crypto  -> CoinGecko (no key needed). Ticker = CoinGecko id, e.g. "bitcoin", "ethereum".
//   Others  -> Twelve Data (needs a free key saved in Settings). Ticker = e.g. "AAPL", "VOO".
// The app is a static web page, so it can only refresh while it is open: once a day when you open it, or on demand.
// Only the ticker symbols are sent to these services, never your amounts or names.
import { getState, update, isAuto } from './store.js';
import { today } from './util.js';

const round = (v) => Math.round(v * 100) / 100;
let running = null;

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function cryptoPrices(ids, cur) {
  const c = cur.toLowerCase();
  const data = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=${c}`);
  return Object.fromEntries(ids.map((id) => [id, data[id] && data[id][c]]));
}

async function stockPrices(symbols, key) {
  const data = await getJSON(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${encodeURIComponent(key)}`);
  if (data.status === 'error') throw new Error(data.message || 'Twelve Data error');
  const one = (d) => (d && d.price != null ? parseFloat(d.price) : NaN);
  if (symbols.length === 1) return { [symbols[0]]: one(data) };
  return Object.fromEntries(symbols.map((sy) => [sy, one(data[sy])]));
}

const rates = {};
async function rate(from, to) {
  if (from === to) return 1;
  if (!rates[from]) {
    const data = await getJSON(`https://open.er-api.com/v6/latest/${from}`);
    if (data.result !== 'success') throw new Error('無法取得匯率');
    rates[from] = data.rates;
  }
  if (!rates[from][to]) throw new Error(`沒有 ${from}→${to} 的匯率`);
  return rates[from][to];
}

/** Fetch fresh prices for every auto-priced holding and update their values. Resolves to { total, updated, errors }. */
export function refreshPrices() {
  if (running) return running;
  running = (async () => {
    const s = getState();
    const cur = s.settings.currency;
    const targets = s.investments.filter(isAuto);
    const result = { total: targets.length, updated: 0, errors: [] };
    const found = new Map(); // holding id -> { price, priceCur, value (per unit, in app currency) }

    const crypto = targets.filter((i) => i.type === 'Crypto');
    if (crypto.length) {
      try {
        const ids = [...new Set(crypto.map((i) => i.ticker.toLowerCase()))];
        const p = await cryptoPrices(ids, cur);
        for (const i of crypto) {
          const price = p[i.ticker.toLowerCase()];
          if (price > 0) found.set(i.id, { price, priceCur: '', unit: price });
          else result.errors.push(`${i.name}：找不到「${i.ticker}」`);
        }
      } catch (e) { result.errors.push(`加密貨幣價格：${e.message}`); }
    }

    const stocks = targets.filter((i) => i.type !== 'Crypto');
    if (stocks.length) {
      if (!s.settings.twelveKey) result.errors.push('股票：請先在設定中填入免費的 Twelve Data 金鑰');
      else {
        try {
          const symbols = [...new Set(stocks.map((i) => i.ticker))];
          const p = await stockPrices(symbols, s.settings.twelveKey);
          for (const i of stocks) {
            const price = p[i.ticker];
            if (!(price > 0)) { result.errors.push(`${i.name}：「${i.ticker}」沒有報價`); continue; }
            const from = i.priceCur || cur;
            try { found.set(i.id, { price, priceCur: i.priceCur, unit: price * (await rate(from, cur)) }); }
            catch (e) { result.errors.push(`${i.name}: ${e.message}`); }
          }
        } catch (e) { result.errors.push(`股票價格：${e.message}`); }
      }
    }

    if (found.size) {
      update((st) => {
        for (const [id, f] of found) {
          const hold = st.investments.find((i) => i.id === id);
          if (!hold) continue;
          hold.price = f.price; hold.priceCur = f.priceCur; hold.priceDate = today();
          hold.amount = round(hold.shares * f.unit);
          hold.updated = today();
        }
        if (!result.errors.length) st.settings.lastPriceRefresh = today();
      }, { silent: true });
      result.updated = found.size;
    }
    window.dispatchEvent(new CustomEvent('prices-updated'));
    return result;
  })().finally(() => { running = null; });
  return running;
}

/** Once per day (when the app is opened or comes back to the front) refresh automatically if turned on. */
export function autoRefresh() {
  const s = getState();
  if (!s.settings.autoPrices || s.settings.lastPriceRefresh === today() || !s.investments.some(isAuto)) return;
  refreshPrices().catch(() => {});
}
