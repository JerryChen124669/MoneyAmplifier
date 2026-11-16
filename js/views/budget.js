// Budget: set a monthly limit per expense category and see this period's progress.
import { h, money, sum, periodRange } from '../util.js';
import { getState, update } from '../store.js';
import { monthNav, activePeriod } from '../components.js';

export const title = 'Budget';

export function render(root) {
  const s = getState();
  const { currency, startDay } = s.settings;
  const { start, end } = periodRange(activePeriod(), startDay);
  const spentBy = {};
  s.transactions.filter((t) => t.type === 'expense' && t.date >= start && t.date < end)
    .forEach((t) => { spentBy[t.category] = (spentBy[t.category] || 0) + t.amount; });

  const totalEl = h('b');
  const paints = [];
  const refreshTotal = () => {
    const limits = Object.entries(getState().budgets).filter(([c]) => s.categories.expense.includes(c));
    const budget = sum(limits, ([, v]) => v);
    const spent = sum(limits, ([c]) => spentBy[c] || 0);
    totalEl.textContent = budget ? `${money(spent, currency)} of ${money(budget, currency)}` : 'No limits set yet';
  };

  const rows = s.categories.expense.map((cat) => {
    const bar = h('i');
    const barBox = h('div', { class: 'bar' }, bar);
    const status = h('span', { class: 'muted' });
    const spent = spentBy[cat] || 0;
    const paint = () => {
      const limit = getState().budgets[cat] || 0;
      bar.style.width = limit ? Math.min(100, (spent / limit) * 100) + '%' : '0%';
      barBox.classList.toggle('over', limit > 0 && spent > limit);
      status.textContent = limit ? `${money(spent, currency)} spent · ${money(limit - spent, currency)} ${spent > limit ? 'over' : 'left'}` : `${money(spent, currency)} spent`;
    };
    paints.push(paint);
    const input = h('input', {
      class: 'limit-input', type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: 'No limit',
      value: s.budgets[cat] || '', 'aria-label': `Monthly limit for ${cat}`,
      onChange: (e) => {
        const v = parseFloat(e.target.value);
        update((st) => { if (v > 0) st.budgets[cat] = v; else delete st.budgets[cat]; }, { silent: true });
        paint(); refreshTotal();
      },
    });
    paint();
    return h('div', { style: 'padding:10px 0;border-bottom:1px solid var(--line)' },
      h('div', { class: 'row' }, h('div', { class: 'grow', style: 'font-weight:600' }, cat), input),
      barBox, status);
  });

  refreshTotal();
  root.append(
    monthNav(() => window.dispatchEvent(new HashChangeEvent('hashchange'))),
    h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Budgeted categories'), totalEl),
    h('div', { class: 'card', style: 'padding-top:4px' }, rows),
    h('p', { class: 'muted' }, 'Limits apply to every month. Add or rename categories in Settings.'));
}
