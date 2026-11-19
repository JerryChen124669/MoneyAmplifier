// Add / edit a transaction. #/add = new, #/add/<id> = edit existing.
// Expenses in the "Investment" category are purchases: they also feed a holding on the Invest page.
import { h, uid, today } from '../util.js';
import { getState, update, INVEST_CATEGORY, INVEST_TYPES, TYPE_EMOJI, buyHolding, undoBuy, pruneHoldings } from '../store.js';
import { toast } from '../components.js';

export const title = 'Add';

export function render(root, id) {
  const s = getState();
  const existing = id ? s.transactions.find((t) => t.id === id) : null;
  const form = existing
    ? { ...existing, amount: String(existing.amount) }
    : { type: 'expense', amount: '', category: '', date: today(), note: '' };
  // which holding a purchase goes into: 'new' or an existing holding's id
  const blankHolding = () => ({ holding: 'new', hName: '', hType: 'Stock', hInst: '' });
  Object.assign(form, blankHolding());
  if (existing && existing.investId && s.investments.some((i) => i.id === existing.investId)) form.holding = existing.investId;

  const isBuy = () => form.type === 'expense' && form.category === INVEST_CATEGORY;

  function holdingCard() {
    const institutions = [...new Set(s.investments.map((i) => i.institution).filter(Boolean))];
    return h('div', { class: 'card stack' },
      h('h2', {}, '📈 Goes to the Invest page'),
      h('p', { class: 'muted', style: 'margin:0' }, 'Your daily account goes down and the holding goes up by the same amount, so your net worth stays the same.'),
      h('label', { class: 'field' }, 'Holding',
        h('select', { value: form.holding, onChange: (e) => { form.holding = e.target.value; draw(); } },
          h('option', { value: 'new' }, '＋ New holding'),
          s.investments.map((i) => h('option', { value: i.id }, `${TYPE_EMOJI[i.type]} ${i.name}${i.institution ? ' · ' + i.institution : ''}`)))),
      form.holding === 'new' ? [
        h('label', { class: 'field' }, 'Name (e.g. TSMC, 0050, US Treasury 10Y)', h('input', { type: 'text', maxlength: '60', value: form.hName, onInput: (e) => { form.hName = e.target.value; } })),
        h('label', { class: 'field' }, 'Type',
          h('select', { value: form.hType, onChange: (e) => { form.hType = e.target.value; } }, INVEST_TYPES.map((t) => h('option', { value: t }, `${TYPE_EMOJI[t]} ${t}`)))),
        h('label', { class: 'field' }, 'Institution managing it (bank, broker, fund company…)',
          h('input', { type: 'text', maxlength: '60', list: 'add-institutions', value: form.hInst, onInput: (e) => { form.hInst = e.target.value; } }),
          h('datalist', { id: 'add-institutions' }, institutions.map((i) => h('option', { value: i })))),
      ] : null);
  }

  function draw() {
    const cats = [...s.categories[form.type]];
    if (form.category && !cats.includes(form.category)) cats.push(form.category); // keep a since-deleted category visible
    const amountEl = h('input', {
      class: 'amount-input', type: 'text', inputmode: 'decimal', placeholder: '0', value: form.amount, 'aria-label': 'Amount',
      onInput: (e) => { form.amount = e.target.value; },
    });
    root.replaceChildren(h('div', { class: 'stack' },
      h('div', { class: 'segmented' },
        ['expense', 'income'].map((t) => h('button', {
          class: form.type === t ? 'on' : '',
          onClick: () => { if (form.type !== t) { form.type = t; form.category = ''; draw(); } },
        }, t === 'expense' ? 'Expense' : 'Income'))),
      h('div', { class: 'card' }, amountEl),
      h('div', { class: 'card' }, h('h2', {}, '🏷️ Category'),
        h('div', { class: 'chips' }, cats.map((c) => h('button', {
          class: `chip ${form.category === c ? 'on' : ''}`,
          onClick: () => { form.category = c; draw(); },
        }, c)))),
      isBuy() ? holdingCard() : null,
      h('div', { class: 'card stack' },
        h('label', { class: 'field' }, 'Date', h('input', { type: 'date', value: form.date, onChange: (e) => { form.date = e.target.value; } })),
        h('label', { class: 'field' }, 'Note (optional)', h('input', { type: 'text', maxlength: '200', value: form.note, onInput: (e) => { form.note = e.target.value; } }))),
      h('button', { class: 'btn-primary btn-block', onClick: save }, existing ? 'Save changes' : 'Save'),
      existing ? h('button', { class: 'btn-danger btn-block', onClick: remove }, 'Delete') : null));
    if (!existing && !form.amount) amountEl.focus();
  }

  function save() {
    const amount = parseFloat(String(form.amount).replace(/,/g, ''));
    if (!(amount > 0)) return toast('Enter an amount greater than 0');
    if (!form.category) return toast('Pick a category');
    if (!form.date) return toast('Pick a date');
    const buy = isBuy();
    if (buy && form.holding === 'new' && !form.hName.trim()) return toast('Name what you bought, e.g. TSMC');
    const record = { id: existing ? existing.id : uid(), type: form.type, amount, category: form.category, date: form.date, note: form.note.trim() };
    update((st) => {
      const touched = [];
      if (existing && existing.investId) { undoBuy(st, existing); touched.push(existing.investId); } // take the old purchase back out first
      if (buy) {
        record.investId = buyHolding(st, form.holding === 'new' ? { name: form.hName, type: form.hType, institution: form.hInst } : { id: form.holding }, amount);
      }
      if (existing) st.transactions[st.transactions.findIndex((t) => t.id === existing.id)] = record;
      else st.transactions.push(record);
      pruneHoldings(st, touched);
    }, { silent: true });
    toast(buy ? 'Saved! Added to Invest ✨' : 'Saved! ✨');
    if (existing) location.hash = '#/history';
    else { form.amount = ''; form.note = ''; Object.assign(form, blankHolding()); draw(); }
  }

  function remove() {
    const buy = !!existing.investId;
    if (!confirm(buy ? 'Delete this entry? The amount will also be taken out of its holding on the Invest page.' : 'Delete this entry?')) return;
    update((st) => {
      st.transactions = st.transactions.filter((t) => t.id !== existing.id);
      if (buy) { undoBuy(st, existing); pruneHoldings(st, [existing.investId]); }
    }, { silent: true });
    toast('Deleted');
    location.hash = '#/history';
  }

  if (id && !existing) { root.append(h('div', { class: 'empty' }, 'That entry no longer exists.')); return; }
  draw();
}
