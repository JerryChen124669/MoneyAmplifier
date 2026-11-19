// Net worth ("net profile"): daily account + investments − debts, with a monthly trend.
// The current month's snapshot is saved automatically whenever you open this page.
import { h, money, ymd, uid } from '../util.js';
import { getState, update, netWorthNow } from '../store.js';
import { toast, empty, cssVar, donut } from '../components.js';

export const title = 'Net worth';

const nextMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};

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

  // cash vs time and investments vs time: side by side on wide screens, one at a time (with a switch) on phones
  if (typeof Chart !== 'undefined') {
    root.classList.add('wide');
    const compact = new Intl.NumberFormat(undefined, { notation: 'compact' });

    // cash at the end of each calendar month, worked out from the transactions
    const txs = [...s.transactions].sort((a, b) => a.date.localeCompare(b.date));
    const firstMonth = [txs[0] && txs[0].date.slice(0, 7), rows[0] && rows[0].month, month].filter(Boolean).sort()[0];
    const cashPts = [];
    for (let m = firstMonth; m <= month; m = nextMonth(m)) {
      if (m === month) { cashPts.push([m, now.cash]); break; }
      const cutoff = nextMonth(m) + '-01';
      cashPts.push([m, s.profile.openingCash + txs.filter((t) => t.date < cutoff).reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0)]);
    }
    // investments: monthly snapshots, then the daily log (last value of each month wins), then today
    const inv = new Map(rows.map((r) => [r.month, r.invest]));
    s.valueLog.forEach((v) => inv.set(v.date.slice(0, 7), v.invest));
    if (now.invest > 0 || inv.size) inv.set(month, now.invest);
    const investPts = [...inv.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const make = (canvas, title, pts, color, soft) => {
      const chart = new Chart(canvas, {
        type: 'line',
        data: { labels: pts.map((p) => p[0]), datasets: [{ label: title, data: pts.map((p) => p[1]), borderColor: color, backgroundColor: soft, fill: true, tension: 0.3, pointRadius: pts.length < 4 ? 4 : 2 }] },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + money(c.parsed.y, currency) } } },
          scales: { x: { ticks: { color: cssVar('--muted'), maxTicksLimit: 6 } }, y: { beginAtZero: pts.length < 3, ticks: { color: cssVar('--muted'), callback: (v) => compact.format(v) } } },
        },
      });
      charts.push(chart);
      return chart;
    };
    const panes = [
      { key: 'cash', label: '💵 Cash', title: 'Daily account over time', pts: cashPts, color: '#e8467a', soft: 'rgba(232,70,122,.15)', now: now.cash },
      { key: 'invest', label: '📈 Investments', title: 'Investments over time', pts: investPts, color: '#3fb58a', soft: 'rgba(63,181,138,.18)', now: now.invest },
    ].map((p) => {
      p.canvas = h('canvas');
      const body = p.pts.length ? h('div', { class: 'chart-box' }, p.canvas) : empty('Nothing to chart yet.');
      p.el = h('div', { class: 'card pane' }, h('h2', {}, p.title), h('div', { class: 'big' }, money(p.now, currency)), body,
        p.key === 'invest' && p.pts.length < 3 ? h('div', { class: 'muted' }, 'Your investment value is saved every day you open the app, so this fills in over time.') : null);
      return p;
    });
    const show = (key) => {
      panes.forEach((p) => { p.el.classList.toggle('on', p.key === key); p.btn.classList.toggle('on', p.key === key); if (p.chart && p.key === key) p.chart.resize(); });
    };
    panes.forEach((p) => { p.btn = h('button', { onClick: () => show(p.key) }, p.label); });
    root.append(h('div', { class: 'pair-toggle segmented' }, panes.map((p) => p.btn)), h('div', { class: 'pair' }, panes.map((p) => p.el)));
    show('cash'); // show the first pane before building the charts so they measure a visible box
    panes.forEach((p) => { if (p.pts.length) p.chart = make(p.canvas, p.title, p.pts, p.color, p.soft); });
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
