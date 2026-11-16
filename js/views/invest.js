// Investments: stocks, ETFs, bonds, funds… each with a name, current amount and the institution holding it.
// These are kept apart from daily spending and added together on the Net worth page.
import { h, uid, today, money, sum } from '../util.js';
import { getState, update, INVEST_TYPES, TYPE_EMOJI, investTotal } from '../store.js';
import { toast, empty, donut } from '../components.js';

export const title = 'Investments';

export function render(root) {
  const s = getState();
  const { currency } = s.settings;
  const total = investTotal(s);
  const view = { group: 'type', editing: null }; // editing: null | 'new' | <id>
  let chart = null;

  function draw() {
    if (chart) chart.destroy();
    chart = null;
    root.replaceChildren();

    root.append(h('div', { class: 'card' },
      h('div', { class: 'muted' }, 'Total invested value'),
      h('div', { class: 'big' }, money(total, currency)),
      h('div', { class: 'muted' }, `${s.investments.length} holding${s.investments.length === 1 ? '' : 's'}`)));

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
      h('h2', {}, '🥧 Composition'),
      h('div', { class: 'segmented', style: 'margin-bottom:10px' },
        [['type', 'By type'], ['institution', 'By institution']].map(([k, label]) =>
          h('button', { class: view.group === k ? 'on' : '', onClick: () => { view.group = k; draw(); } }, label))),
      chart ? chart.el : empty('All holdings are worth 0.')));

    // list, grouped by institution
    const byInst = {};
    s.investments.forEach((i) => (byInst[i.institution || 'No institution'] ||= []).push(i));
    root.append(h('h2', { class: 'section-title' }, '🏦 Holdings'));
    Object.entries(byInst).sort((a, b) => sum(b[1], (x) => x.amount) - sum(a[1], (x) => x.amount)).forEach(([inst, items]) => {
      root.append(h('div', { class: 'day-head' }, h('span', {}, inst), h('span', {}, money(sum(items, (x) => x.amount), currency))),
        h('div', { class: 'card', style: 'padding:4px 16px;margin-bottom:0' },
          [...items].sort((a, b) => b.amount - a.amount).map((i) => h('button', { class: 'tx tx-btn', onClick: () => { view.editing = i.id; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
            h('div', { class: 'grow' },
              h('div', { class: 'name' }, `${TYPE_EMOJI[i.type]} ${i.name}`),
              h('div', { class: 'muted' }, `${i.type} · updated ${i.updated}`)),
            h('div', { class: 'amt' }, money(i.amount, currency))))));
    });
  }

  function formCard() {
    const existing = view.editing === 'new' ? null : s.investments.find((i) => i.id === view.editing);
    const f = existing ? { ...existing, amount: String(existing.amount) } : { name: '', type: 'Stock', institution: '', amount: '' };
    const institutions = [...new Set(s.investments.map((i) => i.institution).filter(Boolean))];
    const listId = 'institution-list';

    const save = () => {
      const amount = parseFloat(String(f.amount).replace(/,/g, ''));
      if (!f.name.trim()) return toast('Enter a name');
      if (!(amount >= 0)) return toast('Enter the current amount');
      const rec = { id: existing ? existing.id : uid(), name: f.name.trim(), type: f.type, institution: f.institution.trim(), amount, updated: today() };
      update((st) => {
        if (existing) st.investments[st.investments.findIndex((i) => i.id === existing.id)] = rec;
        else st.investments.push(rec);
      }, { silent: true });
      toast('Saved! ✨');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    };
    const remove = () => {
      if (!confirm(`Delete "${existing.name}"?`)) return;
      update((st) => { st.investments = st.investments.filter((i) => i.id !== existing.id); }, { silent: true });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    };

    return h('div', { class: 'card stack' },
      h('h2', {}, existing ? '✏️ Edit investment' : '🌱 New investment'),
      h('label', { class: 'field' }, 'Name (e.g. TSMC, 0050, US Treasury 10Y)', h('input', { type: 'text', maxlength: '60', value: f.name, onInput: (e) => { f.name = e.target.value; } })),
      h('label', { class: 'field' }, 'Type',
        h('select', { value: f.type, onChange: (e) => { f.type = e.target.value; } }, INVEST_TYPES.map((t) => h('option', { value: t }, `${TYPE_EMOJI[t]} ${t}`)))),
      h('label', { class: 'field' }, 'Institution managing it (bank, broker, fund company…)',
        h('input', { type: 'text', maxlength: '60', list: listId, value: f.institution, onInput: (e) => { f.institution = e.target.value; } }),
        h('datalist', { id: listId }, institutions.map((i) => h('option', { value: i })))),
      h('label', { class: 'field' }, 'Current amount / value',
        h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: f.amount, onInput: (e) => { f.amount = e.target.value; } })),
      h('button', { class: 'btn-primary btn-block', onClick: save }, existing ? 'Save changes' : 'Add'),
      existing ? h('button', { class: 'btn-danger btn-block', onClick: remove }, 'Delete') : null,
      h('button', { class: 'btn-block', onClick: () => { view.editing = null; draw(); } }, 'Cancel'));
  }

  draw();
  return () => chart && chart.destroy();
}
