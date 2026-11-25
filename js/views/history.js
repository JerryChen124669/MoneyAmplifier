// History: every transaction in the selected period.
// Filter by type (expense / income) and category, search, and group by day or by category.
// Picking Expenses or Income shows a doughnut chart of what the money was made of.
import { h, money, sum, periodRange, dayLabel } from '../util.js';
import { getState, isTransfer, accountName } from '../store.js';
import { monthNav, txRow, txNote, flowRow, empty, activePeriod, donut, accountPicker, inAccount } from '../components.js';

export const title = '紀錄';

export function render(root) {
  const s = getState();
  const { currency, startDay } = s.settings;
  const { start, end } = periodRange(activePeriod(), startDay);
  const inPeriod = s.transactions.filter((t) => t.date >= start && t.date < end && inAccount(t));
  const filter = { q: '', type: 'all', cat: 'all', group: 'date' };

  const chartBox = h('div');
  const summary = h('div');
  const list = h('div');
  const catSelect = h('select', { 'aria-label': '類別', style: 'margin:0', onChange: (e) => { filter.cat = e.target.value; paint(); } });
  let chart = null;

  const categoryOptions = () => {
    const names = filter.type === 'expense' ? s.categories.expense
      : filter.type === 'income' ? s.categories.income
      : [...s.categories.expense, ...s.categories.income];
    const used = inPeriod.filter((t) => filter.type === 'all' || t.type === filter.type).map((t) => t.category);
    return [...new Set([...names, ...used])];
  };
  function fillCategories() {
    const opts = categoryOptions();
    if (filter.cat !== 'all' && !opts.includes(filter.cat)) filter.cat = 'all';
    catSelect.replaceChildren(h('option', { value: 'all' }, '所有類別'), ...opts.map((c) => h('option', { value: c }, c)));
    catSelect.value = filter.cat;
  }

  function paint() {
    const q = filter.q.trim().toLowerCase();
    const byType = inPeriod
      .filter((t) => filter.type === 'all' || t.type === filter.type)
      .filter((t) => !q || `${t.category} ${t.note}`.toLowerCase().includes(q));
    const rows = byType.filter((t) => filter.cat === 'all' || t.category === filter.cat)
      .sort((a, b) => b.date.localeCompare(a.date));

    // doughnut: composition of the selected type (ignores the category filter so all slices show)
    if (chart) chart.destroy();
    chart = null;
    chartBox.replaceChildren();
    if (filter.type !== 'all' && byType.length) {
      const totals = {};
      byType.forEach((t) => { totals[t.category || '未分類'] = (totals[t.category || '未分類'] || 0) + t.amount; });
      const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      chart = donut(entries, currency);
      chartBox.append(h('div', { class: 'card' },
        h('h2', {}, filter.type === 'expense' ? '支出花在哪' : '收入來源'),
        h('div', { class: `big ${filter.type}` }, money(sum(byType, (t) => t.amount), currency)),
        chart.el));
    }

    // income / spent leave out money moved to or from investments; that is shown on its own
    const flowIn = sum(rows.filter((t) => isTransfer(t) && t.type === 'expense'), (t) => t.amount);
    const flowOut = sum(rows.filter((t) => isTransfer(t) && t.type === 'income'), (t) => t.amount);
    summary.replaceChildren(rows.length ? h('div', { class: 'muted', style: 'margin:4px 8px' },
      `${rows.length} 筆 · ` +
      `收入 ${money(sum(rows.filter((t) => t.type === 'income' && !isTransfer(t)), (t) => t.amount), currency)} · ` +
      `支出 ${money(sum(rows.filter((t) => t.type === 'expense' && !isTransfer(t)), (t) => t.amount), currency)}` +
      (flowIn || flowOut ? ` · 轉入投資 ${money(flowIn, currency)} · 贖回 ${money(flowOut, currency)}` : '')) : '');

    if (!rows.length) return list.replaceChildren(empty(inPeriod.length ? '沒有符合的紀錄。' : '這段期間沒有紀錄。'));

    if (filter.group === 'category') {
      const groups = {};
      rows.forEach((t) => (groups[t.category || '未分類'] ||= []).push(t));
      const grand = sum(rows, (t) => t.amount) || 1;
      list.replaceChildren(...Object.entries(groups)
        .map(([cat, items]) => [cat, items, sum(items, (t) => (t.type === 'income' ? t.amount : -t.amount)), sum(items, (t) => t.amount)])
        .sort((a, b) => b[3] - a[3])
        .map(([cat, items, net, gross]) => h('div', {},
          h('div', { class: 'day-head' },
            h('span', {}, `${cat} · ${Math.round((gross / grand) * 100)}%`),
            h('span', {}, money(net, currency))),
          h('div', { class: 'card', style: 'padding:4px 16px;margin-bottom:0' },
            items.map((t) => isTransfer(t)
              ? flowRow(t, { meta: dayLabel(t.date) })
              : h('a', { class: 'tx', href: `#/add/${t.id}` },
                h('div', { class: 'grow' }, h('div', { class: 'name' }, dayLabel(t.date)), h('div', { class: 'muted' }, [accountName(s, t.account), txNote(t)].filter(Boolean).join(' · '))),
                h('div', { class: `amt ${t.type}` }, (t.type === 'income' ? '+' : '−') + money(t.amount, currency))))))));
      return;
    }

    const days = {};
    rows.forEach((t) => (days[t.date] ||= []).push(t));
    list.replaceChildren(...Object.entries(days).map(([date, items]) => {
      const net = sum(items, (t) => (t.type === 'income' ? t.amount : -t.amount));
      return h('div', {},
        h('div', { class: 'day-head' }, h('span', {}, dayLabel(date)), h('span', {}, money(net, currency))),
        h('div', { class: 'card', style: 'padding:4px 16px;margin-bottom:0' }, items.map(txRow)));
    }));
  }

  const groupButtons = [['date', '依日期'], ['category', '依類別']].map(([k, label]) => {
    const b = h('button', { class: k === filter.group ? 'on' : '', onClick: () => {
      filter.group = k;
      groupButtons.forEach((x) => x.classList.toggle('on', x === b));
      paint();
    } }, label);
    return b;
  });

  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  root.append(
    monthNav(rerender),
    accountPicker(rerender),
    h('div', { class: 'stack', style: 'margin-bottom:10px' },
      h('input', { type: 'search', placeholder: '搜尋…', 'aria-label': '搜尋', style: 'margin:0', onInput: (e) => { filter.q = e.target.value; paint(); } }),
      h('div', { class: 'row' },
        h('select', {
          'aria-label': '類型', style: 'margin:0',
          onChange: (e) => { filter.type = e.target.value; fillCategories(); paint(); },
        }, h('option', { value: 'all' }, '所有類型'), h('option', { value: 'expense' }, '支出'), h('option', { value: 'income' }, '收入')),
        catSelect),
      h('div', { class: 'segmented' }, groupButtons)),
    chartBox, summary, list);

  fillCategories();
  paint();
  return () => chart && chart.destroy();
}
