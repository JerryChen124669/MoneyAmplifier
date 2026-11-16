// History: every transaction in the selected period, grouped by day, with search + type filter.
import { h, money, sum, periodRange, dayLabel } from '../util.js';
import { getState } from '../store.js';
import { monthNav, txRow, empty, activePeriod } from '../components.js';

export const title = 'History';

export function render(root) {
  const s = getState();
  const { currency, startDay } = s.settings;
  const { start, end } = periodRange(activePeriod(), startDay);
  const inPeriod = s.transactions.filter((t) => t.date >= start && t.date < end);
  const filter = { q: '', type: 'all' };
  const list = h('div');

  function paintList() {
    const q = filter.q.trim().toLowerCase();
    const rows = inPeriod
      .filter((t) => filter.type === 'all' || t.type === filter.type)
      .filter((t) => !q || `${t.category} ${t.note}`.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!rows.length) return list.replaceChildren(empty(inPeriod.length ? 'No matches.' : 'No entries in this period.'));
    const days = {};
    rows.forEach((t) => (days[t.date] ||= []).push(t));
    list.replaceChildren(...Object.entries(days).map(([date, items]) => {
      const net = sum(items, (t) => (t.type === 'income' ? t.amount : -t.amount));
      return h('div', {},
        h('div', { class: 'day-head' }, h('span', {}, dayLabel(date)), h('span', {}, money(net, currency))),
        h('div', { class: 'card', style: 'padding:4px 16px;margin-bottom:0' }, items.map(txRow)));
    }));
  }

  root.append(
    monthNav(() => window.dispatchEvent(new HashChangeEvent('hashchange'))),
    h('div', { class: 'row', style: 'margin-bottom:6px' },
      h('input', { type: 'search', placeholder: 'Search…', 'aria-label': 'Search', style: 'margin:0', onInput: (e) => { filter.q = e.target.value; paintList(); } }),
      h('select', { 'aria-label': 'Type', style: 'margin:0;width:120px', onChange: (e) => { filter.type = e.target.value; paintList(); } },
        h('option', { value: 'all' }, 'All'), h('option', { value: 'expense' }, 'Expenses'), h('option', { value: 'income' }, 'Income'))),
    list);
  paintList();
}
