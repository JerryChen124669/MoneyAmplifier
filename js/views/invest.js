// Investments: stocks, ETFs, bonds, funds… each with a name, current value and the institution holding it.
// Adding one records the purchase as an Expense; "Buy more" and "Cash out" (Add page) keep cash and holdings in step.
// Holdings with a ticker + shares are re-priced automatically (see prices.js).
import { h, uid, today, money, sum } from '../util.js';
import { getState, update, commitTx, INVEST_TYPES, TYPE_EMOJI, INVEST_CATEGORY, investTotal, isAuto } from '../store.js';
import { toast, empty, donut } from '../components.js';
import { refreshPrices } from '../prices.js';

export const title = 'Investments';

const numOf = (v) => parseFloat(String(v ?? '').replace(/,/g, ''));

export function render(root) {
  const s = getState();
  const { currency } = s.settings;
  const total = investTotal(s);
  const view = { group: 'type', editing: null }; // editing: null | 'new' | <id>
  let chart = null;
  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  function draw() {
    if (chart) chart.destroy();
    chart = null;
    root.replaceChildren();

    const auto = s.investments.filter(isAuto);
    const lastPriced = auto.map((i) => i.priceDate).filter(Boolean).sort().pop();
    const refreshBtn = h('button', { class: 'btn-block', style: 'margin-top:10px' }, '↻ Update prices now');
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true; refreshBtn.textContent = 'Updating…';
      try {
        const r = await refreshPrices();
        toast(r.errors.length ? r.errors[0] : `Updated ${r.updated} price${r.updated === 1 ? '' : 's'} ✨`);
      } catch (e) { toast('Could not update prices'); }
      refreshBtn.disabled = false; refreshBtn.textContent = '↻ Update prices now';
    });
    root.append(h('div', { class: 'card' },
      h('div', { class: 'muted' }, 'Total invested value'),
      h('div', { class: 'big' }, money(total, currency)),
      h('div', { class: 'muted' }, `${s.investments.length} holding${s.investments.length === 1 ? '' : 's'}`
        + (auto.length ? ` · ${auto.length} auto-priced${lastPriced ? ', last updated ' + lastPriced : ''}` : '')),
      auto.length ? refreshBtn : null));

    if (view.editing) root.append(formCard());
    else root.append(h('button', { class: 'btn-primary btn-block', style: 'margin-bottom:14px', onClick: () => { view.editing = 'new'; draw(); } }, '+ Add investment'));

    if (!s.investments.length) {
      root.append(h('div', { class: 'card' }, empty('No investments yet. Add a stock, ETF, bond, fund…')));
      return;
    }

    // composition
    const groupBy = view.group === 'type' ? (i) => i.type : (i) => i.institution || 'No institution';
    const totals = {};
    s.investments.forEach((i) => { const k = groupBy(i); totals[k] = (totals[k] || 0) + i.amount; });
    const entries = Object.entries(totals).filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1]);
    chart = entries.length ? donut(entries, currency) : null;
    root.append(h('div', { class: 'card' },
      h('h2', {}, '🧸 Composition'),
      h('div', { class: 'segmented', style: 'margin-bottom:10px' },
        [['type', 'By type'], ['institution', 'By institution']].map(([k, label]) =>
          h('button', { class: view.group === k ? 'on' : '', onClick: () => { view.group = k; draw(); } }, label))),
      chart ? chart.el : empty('All holdings are worth 0.')));

    // list, grouped by institution
    const byInst = {};
    s.investments.forEach((i) => (byInst[i.institution || 'No institution'] ||= []).push(i));
    root.append(h('h2', { class: 'section-title' }, '🥎 Holdings'));
    Object.entries(byInst).sort((a, b) => sum(b[1], (x) => x.amount) - sum(a[1], (x) => x.amount)).forEach(([inst, items]) => {
      root.append(h('div', { class: 'day-head' }, h('span', {}, inst), h('span', {}, money(sum(items, (x) => x.amount), currency))),
        h('div', { class: 'card', style: 'padding:4px 16px;margin-bottom:0' },
          [...items].sort((a, b) => b.amount - a.amount).map((i) => h('button', { class: `tx tx-btn${i.amount <= 0 ? ' sold-out' : ''}`, onClick: () => { view.editing = i.id; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
            h('div', { class: 'grow' },
              h('div', { class: 'name' }, `${TYPE_EMOJI[i.type]} ${i.name}${i.amount <= 0 ? ' · sold out' : ''}`),
              h('div', { class: 'muted' }, isAuto(i) && i.price
                ? `${i.shares} × ${i.price}${i.priceCur ? ' ' + i.priceCur : ''} · ${i.priceDate}`
                : `${i.type} · updated ${i.updated}`)),
            h('div', { class: 'amt' }, money(i.amount, currency))))));
    });
  }

  function formCard() {
    const existing = view.editing === 'new' ? null : s.investments.find((i) => i.id === view.editing);
    const f = existing
      ? { ...existing, amount: String(existing.amount), shares: existing.shares ? String(existing.shares) : '' }
      : { name: '', type: 'Stock', institution: '', ticker: '', shares: '', amount: '', date: today(), record: true };
    const institutions = [...new Set(s.investments.map((i) => i.institution).filter(Boolean))];

    const save = () => {
      const amount = numOf(f.amount);
      const shares = numOf(f.shares);
      if (!f.name.trim()) return toast('Enter a name');
      if (!(amount >= 0)) return toast('Enter the current amount');
      if (f.ticker.trim() && !(shares > 0)) return toast('Enter how many shares / units you hold to price it automatically');
      const base = { name: f.name.trim(), type: f.type, institution: f.institution.trim(), ticker: f.ticker.trim(), shares: shares > 0 ? shares : 0 };
      if (existing) {
        update((st) => { Object.assign(st.investments.find((i) => i.id === existing.id), base, { amount, updated: today() }); }, { silent: true });
      } else if (f.record && amount > 0) {
        // a purchase: records an Expense and the holding together
        const rec = { id: uid(), type: 'expense', amount, category: INVEST_CATEGORY, date: f.date || today(), note: '' };
        update((st) => commitTx(st, rec, null, { pick: base, holdValue: amount, shares: base.shares }), { silent: true });
      } else {
        update((st) => { st.investments.push({ id: uid(), ...base, amount, updated: today(), priceCur: '', price: 0, priceDate: '' }); }, { silent: true });
      }
      toast(!existing && f.record && amount > 0 ? 'Saved! Recorded as an expense ✨' : 'Saved! ✨');
      rerender();
    };
    const remove = () => {
      if (!confirm(`Delete "${existing.name}"? Past expense / income entries for it stay in History.`)) return;
      update((st) => { st.investments = st.investments.filter((i) => i.id !== existing.id); }, { silent: true });
      rerender();
    };

    return h('div', { class: 'card stack' },
      h('h2', {}, existing ? '✏️ Edit investment' : '🦴 New investment'),
      h('label', { class: 'field' }, 'Name (e.g. TSMC, 0050, US Treasury 10Y)', h('input', { type: 'text', maxlength: '60', value: f.name, onInput: (e) => { f.name = e.target.value; } })),
      h('label', { class: 'field' }, 'Type',
        h('select', { value: f.type, onChange: (e) => { f.type = e.target.value; } }, INVEST_TYPES.map((t) => h('option', { value: t }, `${TYPE_EMOJI[t]} ${t}`)))),
      h('label', { class: 'field' }, 'Institution managing it (bank, broker, fund company…)',
        h('input', { type: 'text', maxlength: '60', list: 'institution-list', value: f.institution, onInput: (e) => { f.institution = e.target.value; } }),
        h('datalist', { id: 'institution-list' }, institutions.map((i) => h('option', { value: i })))),
      h('label', { class: 'field' }, existing ? 'Current value' : 'Amount invested (current value)',
        h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: f.amount, onInput: (e) => { f.amount = e.target.value; } })),
      h('details', { class: 'more', open: !!(f.ticker || f.shares) },
        h('summary', {}, '⚡ Automatic price updates (optional)'),
        h('div', { class: 'stack', style: 'margin-top:10px' },
          h('p', { class: 'muted', style: 'margin:0' }, 'Enter a ticker and how many shares / units you hold, and the value is refreshed daily when you open the app. Crypto: use the CoinGecko id (bitcoin, ethereum). Stocks / ETFs: a Twelve Data symbol (AAPL, VOO); needs a free key in Settings.'),
          h('label', { class: 'field' }, 'Ticker', h('input', { type: 'text', maxlength: '30', autocapitalize: 'off', value: f.ticker, onInput: (e) => { f.ticker = e.target.value; } })),
          h('label', { class: 'field' }, 'Shares / units held', h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: f.shares, onInput: (e) => { f.shares = e.target.value; } })))),
      existing ? null : [
        h('label', { class: 'field' }, 'Date bought', h('input', { type: 'date', value: f.date, onChange: (e) => { f.date = e.target.value; } })),
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: f.record, onChange: (e) => { f.record = e.target.checked; } }),
          h('span', {}, 'Also record this as an Expense (paid from my daily account). Untick it if you already owned this before using the app.')),
      ],
      h('button', { class: 'btn-primary btn-block', onClick: save }, existing ? 'Save changes' : 'Add'),
      existing ? h('div', { class: 'row' },
        h('a', { class: 'btn grow', style: 'text-align:center;text-decoration:none', href: `#/add/buy-${existing.id}` }, '＋ Buy more'),
        h('a', { class: 'btn grow', style: 'text-align:center;text-decoration:none', href: `#/add/sell-${existing.id}` }, '💵 Cash out')) : null,
      existing ? h('button', { class: 'btn-danger btn-block', onClick: remove }, 'Delete') : null,
      h('button', { class: 'btn-block', onClick: () => { view.editing = null; draw(); } }, 'Cancel'));
  }

  draw();
  return () => chart && chart.destroy();
}
