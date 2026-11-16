// Net worth: record assets and liabilities once a month and watch the trend.
import { h, uid, money, ymd } from '../util.js';
import { getState, update } from '../store.js';
import { toast, empty, cssVar } from '../components.js';

export const title = 'Net worth';

export function render(root) {
  const s = getState();
  const { currency } = s.settings;
  const rows = [...s.netWorth].sort((a, b) => a.month.localeCompare(b.month));
  const latest = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const net = (r) => r.assets - r.liabilities;

  const month = h('input', { type: 'month', value: latest ? latest.month : ymd(new Date()).slice(0, 7) });
  const assets = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '0' });
  const debts = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '0' });
  const fill = (r) => { month.value = r.month; assets.value = r.assets; debts.value = r.liabilities; };
  if (latest) fill(latest);

  const save = () => {
    const a = parseFloat(assets.value), l = parseFloat(debts.value || '0');
    if (!month.value) return toast('Pick a month');
    if (!(a >= 0) || !(l >= 0)) return toast('Enter assets (and debts if any)');
    update((st) => {
      const found = st.netWorth.find((r) => r.month === month.value);
      if (found) { found.assets = a; found.liabilities = l; } else st.netWorth.push({ id: uid(), month: month.value, assets: a, liabilities: l });
    }, { silent: true });
    toast('Saved');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  root.append(h('div', { class: 'card' },
    h('div', { class: 'muted' }, latest ? `Latest (${latest.month})` : 'Net worth'),
    h('div', { class: 'big' }, latest ? money(net(latest), currency) : '—'),
    latest && prev ? h('div', { class: `muted ${net(latest) >= net(prev) ? 'income' : 'expense'}` },
      `${net(latest) >= net(prev) ? '▲' : '▼'} ${money(Math.abs(net(latest) - net(prev)), currency)} vs ${prev.month}`) : null));

  let chart = null;
  if (rows.length >= 2 && typeof Chart !== 'undefined') {
    const canvas = h('canvas');
    root.append(h('div', { class: 'card' }, h('h2', {}, 'Trend'), h('div', { class: 'chart-box' }, canvas)));
    chart = new Chart(canvas, {
      type: 'line',
      data: { labels: rows.map((r) => r.month), datasets: [{ label: 'Net worth', data: rows.map(net), borderColor: cssVar('--brand'), backgroundColor: cssVar('--brand-soft'), fill: true, tension: 0.3 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: cssVar('--muted') } }, y: { ticks: { color: cssVar('--muted') } } } },
    });
  }

  root.append(
    h('div', { class: 'card stack' }, h('h2', {}, 'Record a month'),
      h('label', { class: 'field' }, 'Month', month),
      h('label', { class: 'field' }, 'Total assets (cash, savings, investments…)', assets),
      h('label', { class: 'field' }, 'Total debts', debts),
      h('button', { class: 'btn-primary btn-block', onClick: save }, 'Save')),
    h('div', { class: 'card' }, h('h2', {}, 'History'),
      rows.length ? [...rows].reverse().map((r) => h('div', { class: 'tx' },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, r.month), h('div', { class: 'muted' }, `${money(r.assets, currency)} − ${money(r.liabilities, currency)}`)),
        h('div', { class: 'amt' }, money(net(r), currency)),
        h('button', { 'aria-label': `Edit ${r.month}`, onClick: () => { fill(r); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Edit'),
        h('button', {
          class: 'btn-danger', 'aria-label': `Delete ${r.month}`,
          onClick: () => { if (confirm(`Delete ${r.month}?`)) update((st) => { st.netWorth = st.netWorth.filter((x) => x.id !== r.id); }); },
        }, '×'))) : empty('No records yet.')));

  return () => chart && chart.destroy();
}
