// Add / edit a transaction. #/add = new, #/add/<id> = edit existing,
// #/add/buy-<holdingId> and #/add/sell-<holdingId> = buy more of / cash out of a holding (links from the Invest page).
// Expenses in the "Investment" category and income in the "Investment cash-out" category move money between
// the daily account and a holding on the Invest page, so both pages always stay in step.
import { h, uid, today, money } from '../util.js';
import { getState, update, INVEST_CATEGORY, INVEST_OUT_CATEGORY, INVEST_TYPES, TYPE_EMOJI, commitTx, removeTx, ensureAccount } from '../store.js';
import { toast, accountField, methodField } from '../components.js';

export const title = 'Add';

const numOf = (v) => parseFloat(String(v ?? '').replace(/,/g, ''));

export function render(root, id) {
  const s = getState();
  const { currency } = s.settings;
  const preset = /^(buy|sell)-/.test(id || '') ? id.split('-')[0] : null;
  const presetHolding = preset ? id.slice(preset.length + 1) : null;
  const existing = id && !preset ? s.transactions.find((t) => t.id === id) : null;

  // the account is typed (or picked from the ones you used before); a new name creates the account when you save
  const acctNameOf = (id) => (s.accounts.find((a) => a.id === id) || s.accounts[0]).name;
  const lastAcct = s.accounts.some((a) => a.id === s.settings.lastAccount) ? s.settings.lastAccount : s.accounts[0].id;
  const form = existing
    ? { ...existing, amount: String(existing.amount), accountName: acctNameOf(existing.account), method: existing.method || '' }
    : { type: 'expense', amount: '', category: '', date: today(), note: '', accountName: acctNameOf(lastAcct), method: s.settings.lastMethod || '' };
  Object.assign(form, { holding: 'new', hName: '', hType: 'Stock', hInst: '', hTicker: '', shares: '', removed: '' });
  if (existing && existing.investId) {
    if (s.investments.some((i) => i.id === existing.investId)) form.holding = existing.investId;
    if (existing.shares) form.shares = String(existing.shares);
    if (existing.type === 'income' && existing.holdValue != null) form.removed = String(existing.holdValue);
  }
  if (preset && s.investments.some((i) => i.id === presetHolding)) {
    form.type = preset === 'buy' ? 'expense' : 'income';
    form.category = preset === 'buy' ? INVEST_CATEGORY : INVEST_OUT_CATEGORY;
    form.holding = presetHolding;
  }

  const isBuy = () => form.type === 'expense' && form.category === INVEST_CATEGORY;
  const isSell = () => form.type === 'income' && form.category === INVEST_OUT_CATEGORY;
  const holdLabel = (i) => `${TYPE_EMOJI[i.type]} ${i.name}${i.institution ? ' · ' + i.institution : ''}`;

  function buyCard() {
    const institutions = [...new Set(s.investments.map((i) => i.institution).filter(Boolean))];
    return h('div', { class: 'card stack' },
      h('h2', {}, '📈 Cash in: goes to the Invest page'),
      h('p', { class: 'muted', style: 'margin:0' }, 'Your daily account goes down and the holding goes up by the same amount, so your net worth stays the same.'),
      h('label', { class: 'field' }, 'Holding',
        h('select', { value: form.holding, onChange: (e) => { form.holding = e.target.value; draw(); } },
          h('option', { value: 'new' }, '＋ New holding'),
          s.investments.map((i) => h('option', { value: i.id }, holdLabel(i))))),
      form.holding === 'new' ? [
        h('label', { class: 'field' }, 'Name (e.g. TSMC, 0050, US Treasury 10Y)', h('input', { type: 'text', maxlength: '60', value: form.hName, onInput: (e) => { form.hName = e.target.value; } })),
        h('label', { class: 'field' }, 'Type',
          h('select', { value: form.hType, onChange: (e) => { form.hType = e.target.value; } }, INVEST_TYPES.map((t) => h('option', { value: t }, `${TYPE_EMOJI[t]} ${t}`)))),
        h('label', { class: 'field' }, 'Institution managing it (bank, broker, fund company…)',
          h('input', { type: 'text', maxlength: '60', list: 'add-institutions', value: form.hInst, onInput: (e) => { form.hInst = e.target.value; } }),
          h('datalist', { id: 'add-institutions' }, institutions.map((i) => h('option', { value: i })))),
        h('label', { class: 'field' }, 'Ticker (optional, for automatic price updates: AAPL, VOO, or bitcoin for crypto)',
          h('input', { type: 'text', maxlength: '30', autocapitalize: 'off', value: form.hTicker, onInput: (e) => { form.hTicker = e.target.value; } })),
      ] : null,
      h('label', { class: 'field' }, 'Shares / units bought (optional)',
        h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: form.shares, onInput: (e) => { form.shares = e.target.value; } })));
  }

  function sellCard() {
    if (!s.investments.length) return h('div', { class: 'card' }, h('p', { class: 'muted', style: 'margin:0' }, 'You have no holdings on the Invest page to cash out of yet.'));
    if (form.holding === 'new') form.holding = s.investments[0].id;
    const hold = s.investments.find((i) => i.id === form.holding);
    return h('div', { class: 'card stack' },
      h('h2', {}, '💵 Cash out: comes from the Invest page'),
      h('p', { class: 'muted', style: 'margin:0' }, 'The amount above is the cash you received. It goes into your daily account, and the value below comes off the holding. If you got more than it was worth, the difference is your profit.'),
      h('label', { class: 'field' }, 'Holding',
        h('select', { value: form.holding, onChange: (e) => { form.holding = e.target.value; draw(); } },
          s.investments.map((i) => h('option', { value: i.id }, `${holdLabel(i)} (${money(i.amount, currency)})`)))),
      h('label', { class: 'field' }, 'Value taken off the holding (blank = same as the amount received)',
        h('div', { class: 'row' },
          h('input', { type: 'text', inputmode: 'decimal', placeholder: String(form.amount || '0'), style: 'margin:0', value: form.removed, onInput: (e) => { form.removed = e.target.value; } }),
          h('button', { type: 'button', onClick: () => { form.removed = String(hold.amount); draw(); } }, 'All'))),
      hold && hold.shares > 0 ? h('label', { class: 'field' }, `Shares / units sold (blank = in proportion; you hold ${hold.shares})`,
        h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: form.shares, onInput: (e) => { form.shares = e.target.value; } })) : null);
  }

  function draw() {
    const cats = [...s.categories[form.type]];
    if (form.category && !cats.includes(form.category)) cats.push(form.category); // keep a since-deleted category visible
    const amountEl = h('input', {
      class: 'amount-input', type: 'text', inputmode: 'decimal', placeholder: '0', value: form.amount, 'aria-label': isSell() ? 'Amount received' : 'Amount',
      onInput: (e) => { form.amount = e.target.value; },
    });
    root.replaceChildren(h('div', { class: 'stack' },
      h('div', { class: 'segmented' },
        ['expense', 'income'].map((t) => h('button', {
          class: form.type === t ? 'on' : '',
          onClick: () => { if (form.type !== t) { form.type = t; form.category = ''; if (t === 'income' && form.method === 'card') form.method = ''; draw(); } },
        }, t === 'expense' ? 'Expense' : 'Income'))),
      h('div', { class: 'card' }, amountEl),
      // which bank account, then how it was paid (cash / transfer / credit card), then the category
      h('div', { class: 'card stack' }, h('h2', {}, '🏦 Account'),
        accountField(form, { label: form.type === 'expense' ? 'Paid from which account?' : 'Goes into which account?' }),
        methodField(form, { income: form.type === 'income', label: form.type === 'expense' ? 'How did you pay?' : 'How did it arrive?' })),
      h('div', { class: 'card' }, h('h2', {}, '🦴 Category'),
        h('div', { class: 'chips' }, cats.map((c) => h('button', {
          class: `chip ${form.category === c ? 'on' : ''}`,
          onClick: () => { form.category = c; draw(); },
        }, c)))),
      isBuy() ? buyCard() : isSell() ? sellCard() : null,
      h('div', { class: 'card stack' },
        h('label', { class: 'field' }, 'Date', h('input', { type: 'date', value: form.date, onChange: (e) => { form.date = e.target.value; } })),
        h('label', { class: 'field' }, 'Note (optional)', h('input', { type: 'text', maxlength: '200', value: form.note, onInput: (e) => { form.note = e.target.value; } }))),
      h('button', { class: 'btn-primary btn-block', onClick: save }, existing ? 'Save changes' : 'Save'),
      existing ? h('button', { class: 'btn-danger btn-block', onClick: remove }, 'Delete') : null));
    if (!existing && !form.amount) amountEl.focus();
  }

  function save() {
    const amount = numOf(form.amount);
    if (!(amount > 0)) return toast('Enter an amount greater than 0');
    if (!form.category) return toast('Pick a category');
    if (!form.date) return toast('Pick a date');
    if (!form.accountName.trim()) return toast('Type or pick an account');
    const record = { id: existing ? existing.id : uid(), type: form.type, amount, category: form.category, date: form.date, note: form.note.trim(), method: form.method };
    let link = null;
    if (isBuy()) {
      if (form.holding === 'new' && !form.hName.trim()) return toast('Name what you bought, e.g. TSMC');
      const shares = numOf(form.shares);
      link = {
        pick: form.holding === 'new' ? { name: form.hName, type: form.hType, institution: form.hInst, ticker: form.hTicker } : { id: form.holding },
        holdValue: amount, shares: shares > 0 ? shares : 0,
      };
    } else if (isSell()) {
      const hold = s.investments.find((i) => i.id === form.holding);
      if (!hold) return toast('Pick the holding you cashed out of');
      // when editing, the old cash-out is put back first, so allow up to value + what it took off
      const room = hold.amount + (existing && existing.investId === hold.id ? existing.holdValue ?? existing.amount : 0);
      const removed = Math.min(form.removed.trim() ? numOf(form.removed) : amount, room);
      if (!(removed > 0)) return toast('Nothing left in that holding to take off');
      const heldShares = hold.shares + (existing && existing.investId === hold.id ? existing.shares || 0 : 0);
      let shares = numOf(form.shares);
      if (!(shares > 0)) shares = heldShares > 0 && room > 0 ? heldShares * Math.min(1, removed / room) : 0;
      link = { pick: { id: hold.id }, holdValue: removed, shares };
    }
    update((st) => {
      record.account = ensureAccount(st, form.accountName); // a name you have not used before becomes a new account
      commitTx(st, record, existing, link);
      st.settings.lastAccount = record.account;
      st.settings.lastMethod = form.method;
    }, { silent: true });
    toast(link ? (isBuy() ? 'Saved! Added to Invest ✨' : 'Saved! Taken off Invest ✨') : 'Saved! ✨');
    if (existing) location.hash = '#/history';
    else if (preset) location.hash = '#/invest';
    else {
      Object.assign(form, { amount: '', note: '', holding: 'new', hName: '', hType: 'Stock', hInst: '', hTicker: '', shares: '', removed: '' });
      draw();
    }
  }

  function remove() {
    const linked = !!existing.investId;
    if (!confirm(linked ? 'Delete this entry? The Invest page will be put back the way it was before it.' : 'Delete this entry?')) return;
    update((st) => removeTx(st, existing), { silent: true });
    toast('Deleted');
    location.hash = '#/history';
  }

  if (id && !preset && !existing) { root.append(h('div', { class: 'empty' }, 'That entry no longer exists.')); return; }
  draw();
}
