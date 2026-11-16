// Home: totals for the selected period, spending-by-category chart, recent transactions.
import { h, money, sum, periodRange } from '../util.js';
import { getState } from '../store.js';
import { monthNav, txRow, empty, activePeriod, PALETTE, cssVar } from '../components.js';

export const title = 'MoneyAmplifier';

export function render(root) {
  const s = getState();
  const { currency, startDay } = s.settings;
  const { start, end } = periodRange(activePeriod(), startDay);
  const txs = s.transactions.filter((t) => t.date >= start && t.date < end);
  const income = sum(txs.filter((t) => t.type === 'income'), (t) => t.amount);
  const expense = sum(txs.filter((t) => t.type === 'expense'), (t) => t.amount);
  const balance = income - expense;

  root.append(
    monthNav(() => window.dispatchEvent(new HashChangeEvent('hashchange'))),
    h('div', { class: 'card' },
      h('div', { class: 'muted' }, 'Balance'),
      h('div', { class: `big ${balance >= 0 ? 'income' : 'expense'}` }, money(balance, currency)),
      h('div', { class: 'stats', style: 'margin-top:12px' },
        h('div', {}, h('span', { class: 'muted' }, 'Income'), h('b', { class: 'income' }, money(income, currency))),
        h('div', {}, h('span', { class: 'muted' }, 'Spent'), h('b', { class: 'expense' }, money(expense, currency))),
        h('div', {}, h('span', { class: 'muted' }, 'Entries'), h('b', {}, txs.length)))));

  // spending by category
  const byCat = {};
  txs.filter((t) => t.type === 'expense').forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const chartCard = h('div', { class: 'card' }, h('h2', {}, 'Spending by category'));
  let chart = null;
  if (!cats.length) {
    chartCard.append(empty('No spending in this period yet. Tap + to add one.'));
  } else if (typeof Chart !== 'undefined') {
    const canvas = h('canvas');
    chartCard.append(h('div', { class: 'chart-box' }, canvas));
    chart = new Chart(canvas, {
      type: 'doughnut',
      data: { labels: cats.map((c) => c[0]), datasets: [{ data: cats.map((c) => c[1]), backgroundColor: PALETTE, borderColor: cssVar('--surface'), borderWidth: 2 }] },
      options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: cssVar('--text'), boxWidth: 12 } } } },
    });
  }
  root.append(chartCard);

  const recent = [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  root.append(h('div', { class: 'card' }, h('h2', {}, 'Recent'),
    recent.length ? recent.map(txRow) : empty('Nothing recorded yet.'),
    recent.length ? h('a', { href: '#/history', class: 'muted' }, 'See all →') : null));

  return () => chart && chart.destroy();
}
