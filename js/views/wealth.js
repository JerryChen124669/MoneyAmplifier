// Net worth ("net profile"): daily account + investments − debts, with a monthly trend.
// The current month's snapshot is saved automatically whenever you open this page.
import { h, money, ymd, uid } from '../util.js';
import { getState, update, netWorthNow } from '../store.js';
import { toast, empty, cssVar, donut } from '../components.js';

export const title = 'Net worth';

export function render(root) {
  const s = getState();
  const { currency } = s.settings;
  const now = netWorthNow(s);
  const month = ymd(new Date()).slice(0, 7);

  // auto-snapshot for this month (past months stay as they were)
  const snap = s.netWorth.find((r) => r.month === month);
  if (!snap || snap.cash !== now.cash || snap.invest !== now.invest || snap.debts !== now.debts) {
    update((st) => {
      const f = st.netWorth.find((r) => r.month === month);
      if (f) Object.assign(f, { cash: now.cash, invest: now.invest, debts: now.debts });
      else st.netWorth.push({ id: uid(), month, cash: now.cash, invest: now.invest, debts: now.debts });
    }, { silent: true });
  }
  const rows = [...getState().netWorth].sort((a, b) => a.month.localeCompare(b.month));
  const net = (r) => r.cash + r.invest - r.debts;
  const prev = rows.length >= 2 ? rows[rows.length - 2] : null;

  const charts = [];
  root.append(h('div', { class: 'card' },
    h('div', { class: 'muted' }, 'Your net worth today'),
    h('div', { class: `big ${now.net >= 0 ? 'income' : 'expense'}` }, money(now.net, currency)),
    prev ? h('div', { class: `muted ${now.net >= net(prev) ? 'income' : 'expense'}` },
      `${now.net >= net(prev) ? '▲' : '▼'} ${money(Math.abs(now.net - net(prev)), currency)} vs ${prev.month}`) : null,
    h('div', { class: 'stats', style: 'margin-top:12px' },
      h('div', {}, h('span', { class: 'muted' }, '💵 Daily account'), h('b', {}, money(now.cash, currency))),
      h('div', {}, h('span', { class: 'muted' }, '📈 Investments'), h('b', {}, money(now.invest, currency))),
      h('div', {}, h('span', { class: 'muted' }, '💳 Debts'), h('b', { class: 'expense' }, money(now.debts, currency))))));

  // where the money is
  const byType = {};
  s.investments.forEach((i) => { byType[i.type] = (byType[i.type] || 0) + i.amount; });
  const parts = [...(now.cash > 0 ? [['Daily account', now.cash]] : []), ...Object.entries(byType).filter((e) => e[1] > 0)];
  if (parts.length) {
    const d = donut(parts, currency);
    charts.push(d);
    root.append(h('div', { class: 'card' }, h('h2', {}, '🥧 Where your money is'), d.el));
  }

  // trend
  if (rows.length >= 2 && typeof Chart !== 'undefined') {
    const canvas = h('canvas');
    root.append(h('div', { class: 'card' }, h('h2', {}, '📈 Trend'), h('div', { class: 'chart-box' }, canvas)));
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: rows.map((r) => r.month),
        datasets: [
          { label: 'Net worth', data: rows.map(net), borderColor: cssVar('--brand'), backgroundColor: cssVar('--brand-soft'), fill: true, tension: 0.3 },
          { label: 'Investments', data: rows.map((r) => r.invest), borderColor: '#7bd3b0', borderDash: [5, 4], tension: 0.3, pointRadius: 2 },
        ],
      },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: cssVar('--text'), boxWidth: 12 } } }, scales: { x: { ticks: { color: cssVar('--muted') } }, y: { ticks: { color: cssVar('--muted') } } } },
    });
    charts.push({ destroy: () => chart.destroy() });
  }

  // inputs that feed the net worth
  const opening = h('input', { type: 'number', inputmode: 'decimal', step: 'any', value: s.profile.openingCash });
  const debts = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: s.profile.debts });
  root.append(h('div', { class: 'card stack' }, h('h2', {}, '⚙️ What counts'),
    h('p', { class: 'muted', style: 'margin:0' }, 'Daily account = starting balance + all income − all expenses you record. Investments come from the Invest tab.'),
    h('label', { class: 'field' }, 'Starting balance of your daily account (cash + bank before your first entry)', opening),
    h('label', { class: 'field' }, 'Total debts (loans, credit card balance…)', debts),
    h('button', {
      class: 'btn-primary btn-block',
      onClick: () => {
        const o = parseFloat(opening.value || '0'), d = parseFloat(debts.value || '0');
        if (!Number.isFinite(o) || !(d >= 0)) return toast('Check the numbers');
        update((st) => { st.profile.openingCash = o; st.profile.debts = d; });
        toast('Saved! ✨');
      },
    }, 'Save')));

  root.append(h('div', { class: 'card' }, h('h2', {}, '🗓️ Monthly snapshots'),
    rows.length ? [...rows].reverse().map((r) => h('div', { class: 'tx' },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, r.month), h('div', { class: 'muted' }, `Cash ${money(r.cash, currency)} · Invest ${money(r.invest, currency)} · Debts ${money(r.debts, currency)}`)),
      h('div', { class: 'amt' }, money(net(r), currency)),
      r.month === month ? null : h('button', {
        class: 'btn-danger', 'aria-label': `Delete ${r.month}`,
        onClick: () => { if (confirm(`Delete the ${r.month} snapshot?`)) update((st) => { st.netWorth = st.netWorth.filter((x) => x.id !== r.id); }); },
      }, '×'))) : empty('No snapshots yet.')));

  return () => charts.forEach((c) => c.destroy());
}
