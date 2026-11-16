// Add / edit a transaction. #/add = new, #/add/<id> = edit existing.
import { h, uid, today } from '../util.js';
import { getState, update } from '../store.js';
import { toast } from '../components.js';

export const title = 'Add';

export function render(root, id) {
  const s = getState();
  const existing = id ? s.transactions.find((t) => t.id === id) : null;
  const form = existing
    ? { ...existing, amount: String(existing.amount) }
    : { type: 'expense', amount: '', category: '', date: today(), note: '' };

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
    const record = { id: existing ? existing.id : uid(), type: form.type, amount, category: form.category, date: form.date, note: form.note.trim() };
    update((st) => {
      if (existing) st.transactions[st.transactions.findIndex((t) => t.id === existing.id)] = record;
      else st.transactions.push(record);
    }, { silent: true });
    toast('Saved! ✨');
    if (existing) location.hash = '#/history';
    else { form.amount = ''; form.note = ''; draw(); }
  }

  function remove() {
    if (!confirm('Delete this entry?')) return;
    update((st) => { st.transactions = st.transactions.filter((t) => t.id !== existing.id); }, { silent: true });
    toast('Deleted');
    location.hash = '#/history';
  }

  if (id && !existing) { root.append(h('div', { class: 'empty' }, 'That entry no longer exists.')); return; }
  draw();
}
