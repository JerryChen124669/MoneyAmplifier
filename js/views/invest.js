// Investments: stocks, ETFs, bonds, funds… each with a name, current value and the institution holding it.
// Money moves between your daily account and a holding in three ways, all recorded as normal Expense / Income entries:
//   + Add investment (first purchase), + Buy more, and 💵 Cash out. Edits and deletes are undone on the holding too.
// Holdings with a ticker + shares are re-priced automatically (see prices.js).
import { h, uid, today, money, sum } from '../util.js';
import { getState, update, commitTx, INVEST_TYPES, TYPE_EMOJI, INVEST_CATEGORY, INVEST_OUT_CATEGORY, investTotal, isAuto, isTransfer } from '../store.js';
import { toast, empty, donut, flowRow } from '../components.js';
import { refreshPrices } from '../prices.js';

export const title = 'Investments';

const numOf = (v) => parseFloat(String(v ?? '').replace(/,/g, ''));

export function render(root) {
  const s = getState();
  const { currency } = s.settings;
  const total = investTotal(s);
  // mode: null | 'new' | 'edit' | 'buy' | 'sell'; f holds the form fields so they survive a redraw
  const view = { group: 'type', mode: null, id: null, f: null };
  let chart = null;
  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const held = () => s.investments.filter((i) => i.amount > 0);

  function open(mode, id = null) {
    view.mode = mode;
    view.id = id;
    if (mode === 'buy' || mode === 'sell') {
      view.f = { id: id || (mode === 'sell' ? (held()[0] || {}).id : (s.investments[0] || {}).id), amount: '', removed: '', shares: '', date: today(), note: '' };
    } else if (mode === 'new') {
      view.f = { name: '', type: 'Stock', institution: '', ticker: '', shares: '', amount: '', date: today(), record: true };
    } else if (mode === 'edit') {
      const i = s.investments.find((x) => x.id === id);
      view.f = { ...i, amount: String(i.amount), shares: i.shares ? String(i.shares) : '' };
    }
    draw();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const close = () => { view.mode = null; view.f = null; draw(); };

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

    if (view.mode === 'new' || view.mode === 'edit') root.append(editCard());
    else if (view.mode === 'buy' || view.mode === 'sell') root.append(moveCard());
    else {
      root.append(h('div', { class: 'row', style: 'margin-bottom:14px' },
        h('button', { class: 'btn-primary grow', onClick: () => open('new') }, '+ Add investment'),
        h('button', { class: 'grow', disabled: !held().length, onClick: () => open('sell') }, '💵 Cash out')));
    }

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

    // list, grouped by institution; every holding has its own Buy more / Cash out buttons
    const byInst = {};
    s.investments.forEach((i) => (byInst[i.institution || 'No institution'] ||= []).push(i));
    root.append(h('h2', { class: 'section-title' }, '🥎 Holdings'));
    Object.entries(byInst).sort((a, b) => sum(b[1], (x) => x.amount) - sum(a[1], (x) => x.amount)).forEach(([inst, items]) => {
      root.append(h('div', { class: 'day-head' }, h('span', {}, inst), h('span', {}, money(sum(items, (x) => x.amount), currency))),
        h('div', { class: 'card', style: 'padding:4px 16px;margin-bottom:0' },
          [...items].sort((a, b) => b.amount - a.amount).map((i) => h('div', { class: `holding${i.amount <= 0 ? ' sold-out' : ''}` },
            h('button', { class: 'tx tx-btn', onClick: () => open('edit', i.id) },
              h('div', { class: 'grow' },
                h('div', { class: 'name' }, `${TYPE_EMOJI[i.type]} ${i.name}${i.amount <= 0 ? ' · sold out' : ''}`),
                h('div', { class: 'muted' }, isAuto(i) && i.price
                  ? `${i.shares} × ${i.price}${i.priceCur ? ' ' + i.priceCur : ''} · ${i.priceDate}`
                  : `${i.type} · updated ${i.updated}`)),
              h('div', { class: 'amt' }, money(i.amount, currency))),
            h('div', { class: 'actions' },
              h('button', { class: 'mini', onClick: () => open('buy', i.id) }, '＋ Buy more'),
              i.amount > 0 ? h('button', { class: 'mini', onClick: () => open('sell', i.id) }, '💵 Cash out') : null)))));
    });

    // recent money in / out
    const moves = s.transactions.filter(isTransfer).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    root.append(h('h2', { class: 'section-title' }, '🦴 Cash in / out'),
      h('div', { class: 'card', style: 'margin-top:8px' },
        moves.length ? moves.map((t) => flowRow(t, { meta: t.date }))
          : empty('Nothing yet. Buy more or cash out and it shows up here.'),
        moves.length ? h('a', { href: '#/history', class: 'muted' }, 'See all in History →') : null));
  }

  // ---- Buy more / Cash out ----
  function moveCard() {
    const sell = view.mode === 'sell';
    const f = view.f;
    const choices = sell ? held() : s.investments;
    const hold = s.investments.find((i) => i.id === f.id);
    const label = (i) => `${TYPE_EMOJI[i.type]} ${i.name}${i.institution ? ' · ' + i.institution : ''} (${money(i.amount, currency)})`;

    const save = () => {
      const amount = numOf(f.amount);
      if (!hold) return toast('Pick a holding');
      if (!(amount > 0)) return toast(sell ? 'Enter the cash you received' : 'Enter the amount you paid');
      const base = { id: uid(), amount, date: f.date || today(), note: f.note.trim() };
      if (sell) {
        const removed = Math.min(f.removed.trim() ? numOf(f.removed) : amount, hold.amount);
        if (!(removed > 0)) return toast('Nothing left in that holding to take off');
        let shares = numOf(f.shares);
        if (!(shares > 0)) shares = hold.shares > 0 && hold.amount > 0 ? hold.shares * Math.min(1, removed / hold.amount) : 0;
        const rec = { ...base, type: 'income', category: INVEST_OUT_CATEGORY };
        update((st) => commitTx(st, rec, null, { pick: { id: hold.id }, holdValue: removed, shares }), { silent: true });
        toast('Cashed out! Added to Income ✨');
      } else {
        const shares = numOf(f.shares);
        const rec = { ...base, type: 'expense', category: INVEST_CATEGORY };
        update((st) => commitTx(st, rec, null, { pick: { id: hold.id }, holdValue: amount, shares: shares > 0 ? shares : 0 }), { silent: true });
        toast('Saved! Added to Expenses ✨');
      }
      rerender();
    };

    return h('div', { class: 'card stack' },
      h('h2', {}, sell ? '💵 Cash out' : '＋ Buy more'),
      h('p', { class: 'muted', style: 'margin:0' }, sell
        ? 'The cash you receive goes into your daily account as Income, and the value you take off comes out of the holding. If you got more than it was worth, the difference is your profit.'
        : 'The amount you pay comes out of your daily account as an Expense and goes into the holding, so your net worth stays the same.'),
      h('label', { class: 'field' }, 'Holding',
        h('select', { value: f.id, onChange: (e) => { f.id = e.target.value; draw(); } }, choices.map((i) => h('option', { value: i.id }, label(i))))),
      h('label', { class: 'field' }, sell ? 'Cash received' : 'Amount paid',
        h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: f.amount, onInput: (e) => { f.amount = e.target.value; } })),
      sell ? h('label', { class: 'field' }, 'Value taken off the holding (blank = same as the cash received)',
        h('div', { class: 'row' },
          h('input', { type: 'text', inputmode: 'decimal', placeholder: 'same as cash received', style: 'margin:0', value: f.removed, onInput: (e) => { f.removed = e.target.value; } }),
          h('button', { type: 'button', onClick: () => { f.removed = String(hold ? hold.amount : ''); draw(); } }, 'All'))) : null,
      !sell || (hold && hold.shares > 0) ? h('label', { class: 'field' },
        sell ? `Shares / units sold (blank = in proportion; you hold ${hold.shares})` : 'Shares / units bought (optional)',
        h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: f.shares, onInput: (e) => { f.shares = e.target.value; } })) : null,
      h('label', { class: 'field' }, 'Date', h('input', { type: 'date', value: f.date, onChange: (e) => { f.date = e.target.value; } })),
      h('label', { class: 'field' }, 'Note (optional)', h('input', { type: 'text', maxlength: '200', value: f.note, onInput: (e) => { f.note = e.target.value; } })),
      h('button', { class: 'btn-primary btn-block', onClick: save }, sell ? 'Cash out' : 'Save'),
      h('button', { class: 'btn-block', onClick: close }, 'Cancel'));
  }

  // ---- add / edit a holding ----
  function editCard() {
    const existing = view.mode === 'edit' ? s.investments.find((i) => i.id === view.id) : null;
    const f = view.f;
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
        h('button', { class: 'grow', onClick: () => open('buy', existing.id) }, '＋ Buy more'),
        existing.amount > 0 ? h('button', { class: 'grow', onClick: () => open('sell', existing.id) }, '💵 Cash out') : null) : null,
      existing ? h('button', { class: 'btn-danger btn-block', onClick: remove }, 'Delete') : null,
      h('button', { class: 'btn-block', onClick: close }, 'Cancel'));
  }

  draw();
  return () => chart && chart.destroy();
}
