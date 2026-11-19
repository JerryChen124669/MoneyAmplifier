// Home: totals for the selected period, monthly spending chart, spending-by-category chart, recent transactions.
// "Spent" and "Income" leave out money moved to / from investments (that is saving, not spending).
import { h, money, sum, periodRange, periodKeyFor, shiftKey } from '../util.js';
import { getState, netWorthNow, isTransfer } from '../store.js';
import { monthNav, txRow, empty, activePeriod, PALETTE, cssVar } from '../components.js';

export const title = 'MoneyAmplifier';

const MONTHS_SHOWN = 6;

export function render(root) {
  const s = getState();
  const { currency, startDay } = s.settings;
  const active = activePeriod();
  const { start, end } = periodRange(active, startDay);
  const txs = s.transactions.filter((t) => t.date >= start && t.date < end);
  const earned = txs.filter((t) => t.type === 'income' && !isTransfer(t));
  const spent = txs.filter((t) => t.type === 'expense' && !isTransfer(t));
  const income = sum(earned, (t) => t.amount);
  const expense = sum(spent, (t) => t.amount);
  const balance = income - expense;
  const toInvest = sum(txs.filter((t) => isTransfer(t) && t.type === 'expense'), (t) => t.amount);
  const fromInvest = sum(txs.filter((t) => isTransfer(t) && t.type === 'income'), (t) => t.amount);

  const mood = !txs.length ? "Woof! Let's add your first entry 🐾"
    : balance >= 0 ? `Yay! You're keeping ${money(balance, currency)} this month 🐕`
    : "A little over this month. You've got this! 💪";

  root.append(
    monthNav(() => window.dispatchEvent(new HashChangeEvent('hashchange'))),
    h('div', { class: 'card hero' },
      h('img', { src: 'icons/mascot.svg', alt: 'Shiba mascot' }),
      h('div', { class: 'bubble grow' }, mood)),
    h('div', { class: 'card' },
      h('div', { class: 'muted' }, 'Left over (income − spending)'),
      h('div', { class: `big ${balance >= 0 ? 'income' : 'expense'}` }, money(balance, currency)),
      h('div', { class: 'stats', style: 'margin-top:12px' },
        h('div', {}, h('span', { class: 'muted' }, 'Income'), h('b', { class: 'income' }, money(income, currency))),
        h('div', {}, h('span', { class: 'muted' }, 'Spent'), h('b', { class: 'expense' }, money(expense, currency))),
        h('div', {}, h('span', { class: 'muted' }, 'Entries'), h('b', {}, txs.length))),
      toInvest || fromInvest ? h('div', { class: 'muted', style: 'margin-top:10px' },
        `📈 To investments ${money(toInvest, currency)} · 💵 cashed out ${money(fromInvest, currency)}`) : null));

  const nw = netWorthNow(s);
  root.append(h('a', { class: 'card nw-link', href: '#/wealth' },
    h('div', { class: 'grow' },
      h('div', { class: 'muted' }, 'Net worth · daily account + investments − debts'),
      h('div', { class: `big ${nw.net >= 0 ? 'income' : 'expense'}` }, money(nw.net, currency))),
    h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));

  const charts = [];

  // monthly spending columns + dashed average (investments excluded)
  const spendIn = (key) => {
    const r = periodRange(key, startDay);
    return sum(s.transactions.filter((t) => t.type === 'expense' && !isTransfer(t) && t.date >= r.start && t.date < r.end), (t) => t.amount);
  };
  const firstDate = s.transactions.reduce((m, t) => (!m || t.date < m ? t.date : m), '');
  const firstKey = firstDate ? periodKeyFor(firstDate, startDay) : null;
  const keys = Array.from({ length: MONTHS_SHOWN }, (_, i) => shiftKey(active, i - (MONTHS_SHOWN - 1))).filter((k) => firstKey && k >= firstKey);
  const monthlyCard = h('div', { class: 'card' }, h('h2', {}, '🪀 Monthly spending'));
  if (!keys.length) {
    monthlyCard.append(empty('Add a few entries to see your month-by-month spending.'));
  } else if (typeof Chart !== 'undefined') {
    const values = keys.map(spendIn);
    const avg = sum(values) / values.length;
    const labels = keys.map((k) => {
      const [y, m] = k.split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
    });
    const compact = new Intl.NumberFormat(undefined, { notation: 'compact' });
    monthlyCard.append(
      h('div', { class: 'muted' }, `Average ${money(avg, currency)} / month over the last ${keys.length} month${keys.length === 1 ? '' : 's'} · investments not counted`));
    const canvas = h('canvas');
    monthlyCard.append(h('div', { class: 'chart-box' }, canvas));
    const avgLabel = `${keys.length}-month average`;
    const chart = new Chart(canvas, {
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Spent', data: values, borderRadius: 8, backgroundColor: keys.map((k) => (k === active ? cssVar('--brand') : '#e9c9a0')), order: 2 },
          { type: 'line', label: avgLabel, data: values.map(() => avg), borderColor: cssVar('--text'), borderDash: [6, 5], borderWidth: 2, pointRadius: 0, fill: false, order: 1 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: cssVar('--text'), boxWidth: 14, filter: (item) => item.datasetIndex === 1 } },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y, currency)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: cssVar('--muted') } },
          y: { beginAtZero: true, ticks: { color: cssVar('--muted'), callback: (v) => compact.format(v) } },
        },
      },
    });
    charts.push(chart);
  }
  root.append(monthlyCard);

  // spending by category (this period)
  const byCat = {};
  spent.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const chartCard = h('div', { class: 'card' }, h('h2', {}, '🎾 Spending by category'));
  if (!cats.length) {
    chartCard.append(empty('No spending in this period yet. Tap + to add one.'));
  } else if (typeof Chart !== 'undefined') {
    const canvas = h('canvas');
    chartCard.append(h('div', { class: 'chart-box' }, canvas));
    charts.push(new Chart(canvas, {
      type: 'doughnut',
      data: { labels: cats.map((c) => c[0]), datasets: [{ data: cats.map((c) => c[1]), backgroundColor: PALETTE, borderColor: cssVar('--surface'), borderWidth: 2 }] },
      options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: cssVar('--text'), boxWidth: 12 } } } },
    }));
  }
  root.append(chartCard);

  const recent = [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  root.append(h('div', { class: 'card' }, h('h2', {}, '🦴 Recent'),
    recent.length ? recent.map(txRow) : empty('Nothing recorded yet.'),
    recent.length ? h('a', { href: '#/history', class: 'muted' }, 'See all →') : null));

  return () => charts.forEach((c) => c.destroy());
}
