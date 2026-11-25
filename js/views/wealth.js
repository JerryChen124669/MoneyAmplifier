// Profile (net worth): all accounts + investments − debts, with the balance of each account and charts over time.
// The current month's snapshot is saved automatically whenever you open this page.
import { h, money, ymd, uid } from '../util.js';
import { getState, update, netWorthNow, accountBalance, txEffect } from '../store.js';
import { toast, empty, cssVar, donut, accountPicker, activeAccount } from '../components.js';

export const title = '資產';

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
    h('div', { class: 'muted' }, '目前淨資產'),
    h('div', { class: `big ${now.net >= 0 ? 'income' : 'expense'}` }, money(now.net, currency)),
    prev ? h('div', { class: `muted ${now.net >= net(prev) ? 'income' : 'expense'}` },
      `${now.net >= net(prev) ? '▲' : '▼'} ${money(Math.abs(now.net - net(prev)), currency)} 對比 ${prev.month}`) : null,
    h('div', { class: 'stats', style: 'margin-top:12px' },
      h('div', {}, h('span', { class: 'muted' }, '帳戶'), h('b', {}, money(now.cash, currency))),
      h('div', {}, h('span', { class: 'muted' }, '投資'), h('b', {}, money(now.invest, currency))),
      h('div', {}, h('span', { class: 'muted' }, '負債'), h('b', { class: 'expense' }, money(now.debts, currency)))),
    now.cardDebt ? h('div', { class: 'muted', style: 'margin-top:10px' }, `負債中包含信用卡應付帳款 ${money(now.cardDebt, currency)}　`, h('a', { href: '#/cards' }, '查看信用卡 →')) : null));

  // every account's balance
  root.append(h('div', { class: 'card' }, h('h2', {}, '各帳戶餘額'),
    s.accounts.map((a) => {
      const bal = accountBalance(s, a.id);
      return h('div', { class: 'tx' },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, a.name)),
        h('div', { class: `amt ${bal < 0 ? 'expense' : ''}` }, money(bal, currency)));
    })));

  // where the money is
  const byType = {};
  s.investments.forEach((i) => { byType[i.type] = (byType[i.type] || 0) + i.amount; });
  const parts = [
    ...s.accounts.map((a) => [a.name, accountBalance(s, a.id)]).filter((e) => e[1] > 0),
    ...Object.entries(byType).filter((e) => e[1] > 0),
  ];
  if (parts.length) {
    const d = donut(parts, currency);
    charts.push(d);
    root.append(h('div', { class: 'card' }, h('h2', {}, '資產分布'), d.el));
  }

  // cash vs time and investments vs time: side by side on wide screens, one at a time (with a switch) on phones
  if (typeof Chart !== 'undefined') {
    root.classList.add('wide');
    const compact = new Intl.NumberFormat('zh-TW', { notation: 'compact' });

    // balance at the end of each calendar month for the chosen account (or all accounts), worked out from the transactions
    const acct = activeAccount();
    const acctRec = s.accounts.find((a) => a.id === acct);
    const openingTotal = acct === 'all' ? s.accounts.reduce((a, x) => a + x.opening, 0) : acctRec.opening;
    const nowBalance = acct === 'all' ? now.cash : accountBalance(s, acct);
    const txs = s.transactions.filter((t) => acct === 'all' || t.account === acct || t.toAccount === acct).sort((a, b) => a.date.localeCompare(b.date));
    const firstMonth = [txs[0] && txs[0].date.slice(0, 7), rows[0] && rows[0].month, month].filter(Boolean).sort()[0];
    const cashPts = [];
    for (let m = firstMonth; m <= month; m = nextMonth(m)) {
      if (m === month) { cashPts.push([m, nowBalance]); break; }
      const cutoff = nextMonth(m) + '-01';
      cashPts.push([m, openingTotal + txs.filter((t) => t.date < cutoff).reduce((a, t) => a + txEffect(t, acct), 0)]);
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
      { key: 'cash', label: '帳戶', title: `${acct === 'all' ? '所有帳戶' : acctRec.name} 變化`, pts: cashPts, color: '#5f7fa6', soft: 'rgba(95,127,166,.18)', now: nowBalance },
      { key: 'invest', label: '投資', title: '投資變化', pts: investPts, color: '#5f9a82', soft: 'rgba(95,154,130,.2)', now: now.invest },
    ].map((p) => {
      p.canvas = h('canvas');
      const body = p.pts.length ? h('div', { class: 'chart-box' }, p.canvas) : empty('還沒有資料可畫圖。');
      p.el = h('div', { class: 'card pane' }, h('h2', {}, p.title), h('div', { class: 'big' }, money(p.now, currency)), body,
        p.key === 'invest' && p.pts.length < 3 ? h('div', { class: 'muted' }, '每天開啟 App 都會記錄投資價值，圖表會隨時間逐漸完整。') : null);
      return p;
    });
    const show = (key) => {
      panes.forEach((p) => { p.el.classList.toggle('on', p.key === key); p.btn.classList.toggle('on', p.key === key); if (p.chart && p.key === key) p.chart.resize(); });
    };
    panes.forEach((p) => { p.btn = h('button', { onClick: () => show(p.key) }, p.label); });
    root.append(accountPicker(() => window.dispatchEvent(new HashChangeEvent('hashchange'))),
      h('div', { class: 'pair-toggle segmented' }, panes.map((p) => p.btn)), h('div', { class: 'pair' }, panes.map((p) => p.el)));
    show('cash'); // show the first pane before building the charts so they measure a visible box
    panes.forEach((p) => { if (p.pts.length) p.chart = make(p.canvas, p.title, p.pts, p.color, p.soft); });
  }

  // inputs that feed the net worth
  const openings = s.accounts.map((a) => ({ id: a.id, el: h('input', { type: 'number', inputmode: 'decimal', step: 'any', value: a.opening }) }));
  const debts = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: s.profile.debts });
  root.append(h('div', { class: 'card stack' }, h('h2', {}, '計算設定'),
    h('p', { class: 'muted', style: 'margin:0' }, '帳戶餘額 = 起始餘額 + 收入 − 支出。投資來自「投資」頁。帳戶可在設定中新增或改名。'),
    s.accounts.map((a, i) => h('label', { class: 'field' }, `${a.name}：起始餘額（第一筆紀錄之前）`, openings[i].el)),
    h('label', { class: 'field' }, '其他負債（貸款…；信用卡請在「信用卡」頁管理，會自動計入負債）', debts),
    h('button', {
      class: 'btn-primary btn-block',
      onClick: () => {
        const vals = openings.map((o) => parseFloat(o.el.value || '0')), d = parseFloat(debts.value || '0');
        if (vals.some((v) => !Number.isFinite(v)) || !(d >= 0)) return toast('請檢查數字');
        update((st) => { openings.forEach((o, i) => { st.accounts.find((a) => a.id === o.id).opening = vals[i]; }); st.profile.debts = d; });
        toast('已儲存！');
      },
    }, '儲存')));

  root.append(h('div', { class: 'card' }, h('h2', {}, '每月快照'),
    rows.length ? [...rows].reverse().map((r) => h('div', { class: 'tx' },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, r.month), h('div', { class: 'muted' }, `帳戶 ${money(r.cash, currency)} · 投資 ${money(r.invest, currency)} · 負債 ${money(r.debts, currency)}`)),
      h('div', { class: 'amt' }, money(net(r), currency)),
      r.month === month ? null : h('button', {
        class: 'btn-danger', 'aria-label': `刪除 ${r.month}`,
        onClick: () => { if (confirm(`刪除 ${r.month} 的快照？`)) update((st) => { st.netWorth = st.netWorth.filter((x) => x.id !== r.id); }); },
      }, '×'))) : empty('還沒有快照。')));

  return () => charts.forEach((c) => c.destroy());
}
