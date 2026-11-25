// Home: totals for the selected period, monthly column chart, category doughnut, recent transactions.
// Pick an account (or All accounts) and Spending / Income to change what the charts and totals show.
// "Spent" and "Income" leave out money moved to / from investments (that is saving, not spending).
import { h, money, sum, periodRange, periodKeyFor, shiftKey } from '../util.js';
import { getState, netWorthNow, isTransfer, accountName } from '../store.js';
import { monthNav, txRow, empty, activePeriod, PALETTE, cssVar, ui, activeAccount, inAccount, accountPicker } from '../components.js';

export const title = 'MoneyAmplifier';

const MONTHS_SHOWN = 6;

export function render(root) {
  const s = getState();
  const { currency, startDay } = s.settings;
  const active = activePeriod();
  const acct = activeAccount();
  const flow = ui.flow; // 'expense' | 'income'
  const { start, end } = periodRange(active, startDay);
  const txs = s.transactions.filter((t) => t.date >= start && t.date < end && inAccount(t));
  const earned = txs.filter((t) => t.type === 'income' && !isTransfer(t));
  const spent = txs.filter((t) => t.type === 'expense' && !isTransfer(t));
  const income = sum(earned, (t) => t.amount);
  const expense = sum(spent, (t) => t.amount);
  const balance = income - expense;
  const toInvest = sum(txs.filter((t) => isTransfer(t) && t.type === 'expense'), (t) => t.amount);
  const fromInvest = sum(txs.filter((t) => isTransfer(t) && t.type === 'income'), (t) => t.amount);
  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const scope = acct === 'all' ? '所有帳戶' : accountName(s, acct);

  const mood = !txs.length ? "汪！來記下第一筆吧"
    : balance >= 0 ? `太棒了！這個月結餘 ${money(balance, currency)}`
    : "這個月稍微超支了，加油！";

  root.append(
    monthNav(rerender),
    accountPicker(rerender),
    h('div', { class: 'card mood' }, mood),
    h('div', { class: 'card' },
      h('div', { class: 'muted' }, `結餘（收入 − 支出）· ${scope}`),
      h('div', { class: `big ${balance >= 0 ? 'income' : 'expense'}` }, money(balance, currency)),
      h('div', { class: 'stats', style: 'margin-top:12px' },
        h('div', {}, h('span', { class: 'muted' }, '收入'), h('b', { class: 'income' }, money(income, currency))),
        h('div', {}, h('span', { class: 'muted' }, '支出'), h('b', { class: 'expense' }, money(expense, currency))),
        h('div', {}, h('span', { class: 'muted' }, '筆數'), h('b', {}, txs.length))),
      toInvest || fromInvest ? h('div', { class: 'muted', style: 'margin-top:10px' },
        `轉入投資 ${money(toInvest, currency)} · 投資贖回 ${money(fromInvest, currency)}`) : null));

  const nw = netWorthNow(s);
  root.append(h('a', { class: 'card nw-link', href: '#/wealth' },
    h('div', { class: 'grow' },
      h('div', { class: 'muted' }, '淨資產 · 所有帳戶 + 投資 − 負債'),
      h('div', { class: `big ${nw.net >= 0 ? 'income' : 'expense'}` }, money(nw.net, currency))),
    h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));

  // Spending / Income switch for the two charts below
  root.append(h('div', { class: 'segmented', style: 'margin-bottom:14px' },
    [['expense', '支出'], ['income', '收入']].map(([k, label]) =>
      h('button', { class: flow === k ? 'on' : '', onClick: () => { ui.flow = k; rerender(); } }, label))));

  const charts = [];
  const spendWord = flow === 'expense' ? '支出' : '收入';

  // month-by-month columns; the dashed average line is only for All accounts
  const totalIn = (key) => {
    const r = periodRange(key, startDay);
    return sum(s.transactions.filter((t) => t.type === flow && !isTransfer(t) && inAccount(t) && t.date >= r.start && t.date < r.end), (t) => t.amount);
  };
  const firstDate = s.transactions.reduce((m, t) => (!m || t.date < m ? t.date : m), '');
  const firstKey = firstDate ? periodKeyFor(firstDate, startDay) : null;
  const keys = Array.from({ length: MONTHS_SHOWN }, (_, i) => shiftKey(active, i - (MONTHS_SHOWN - 1))).filter((k) => firstKey && k >= firstKey);
  const monthlyCard = h('div', { class: 'card' }, h('h2', {}, `每月${spendWord}`));
  if (!keys.length) {
    monthlyCard.append(empty('多記幾筆，就能看到每月圖表。'));
  } else if (typeof Chart !== 'undefined') {
    const values = keys.map(totalIn);
    const avg = sum(values) / values.length;
    const labels = keys.map((k) => {
      const [y, m] = k.split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString('zh-TW', { month: 'short' });
    });
    const compact = new Intl.NumberFormat('zh-TW', { notation: 'compact' });
    monthlyCard.append(h('div', { class: 'muted' }, acct === 'all'
      ? `近 ${keys.length} 個月平均每月 ${money(avg, currency)} · 不含投資`
      : `僅 ${scope} · 不含投資`));
    const canvas = h('canvas');
    monthlyCard.append(h('div', { class: 'chart-box' }, canvas));
    const avgLabel = `${keys.length} 個月平均`;
    const datasets = [
      { type: 'bar', label: flow === 'expense' ? '支出' : '收入', data: values, borderRadius: 8, backgroundColor: keys.map((k) => (k === active ? (flow === 'expense' ? '#c4745a' : '#5f9a82') : cssVar('--line'))), order: 2 },
    ];
    if (acct === 'all') {
      datasets.push({ type: 'line', label: avgLabel, data: values.map(() => avg), borderColor: cssVar('--text'), borderDash: [6, 5], borderWidth: 2, pointRadius: 0, fill: false, order: 1 });
    }
    const chart = new Chart(canvas, {
      data: { labels, datasets },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { display: acct === 'all', labels: { color: cssVar('--text'), boxWidth: 14, filter: (item) => item.datasetIndex === 1 } },
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

  // by category (this period, this account)
  const byCat = {};
  (flow === 'expense' ? spent : earned).forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const chartCard = h('div', { class: 'card' }, h('h2', {}, flow === 'expense' ? '支出類別' : '收入類別'));
  if (!cats.length) {
    chartCard.append(empty(`這段期間${acct === 'all' ? '' : '在 ' + scope + ' '}還沒有${spendWord}紀錄，點 + 新增一筆。`));
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
  root.append(h('div', { class: 'card' }, h('h2', {}, '最近紀錄'),
    recent.length ? recent.map(txRow) : empty('還沒有紀錄。'),
    recent.length ? h('a', { href: '#/history', class: 'muted' }, '查看全部 →') : null));

  return () => charts.forEach((c) => c.destroy());
}
