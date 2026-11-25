// Wish list: things you want to buy and their price. For each one it works out how long you would have to work
// (from your income) and how long saving would take (from what is left after spending) before you can afford it.
import { h, money, sum, uid, today, periodKeyFor } from '../util.js';
import { getState, update, isTransfer, netWorthNow } from '../store.js';
import { toast, empty } from '../components.js';

export const title = '願望清單';

const round1 = (v) => Math.round(v * 10) / 10;

/** Average monthly income (and what is left after spending) over the last 3 finished periods that have income. */
function incomeStats(s) {
  const { startDay, incomeOverride } = s.settings;
  const now = periodKeyFor(today(), startDay);
  const inc = {}, exp = {};
  for (const t of s.transactions) {
    if (t.type === 'transfer' || isTransfer(t)) continue; // moving money around, or investing, is neither earning nor spending
    const k = periodKeyFor(t.date, startDay);
    if (t.type === 'income') inc[k] = (inc[k] || 0) + t.amount; else exp[k] = (exp[k] || 0) + t.amount;
  }
  let keys = Object.keys(inc).filter((k) => k < now).sort().slice(-3);
  let basis = keys.length ? `最近 ${keys.length} 個月的平均收入` : '';
  if (!keys.length && inc[now]) { keys = [now]; basis = '本月到目前為止的收入（資料還少，僅供參考）'; }
  const auto = keys.length ? sum(keys, (k) => inc[k]) / keys.length : 0;
  const autoSave = keys.length ? sum(keys, (k) => (inc[k] || 0) - (exp[k] || 0)) / keys.length : 0;
  if (incomeOverride > 0) return { income: incomeOverride, saving: null, basis: '你自己設定的月收入', auto };
  return { income: auto, saving: keys.length ? autoSave : null, basis, auto };
}

export function render(root) {
  const s = getState();
  const { currency, workDays, workHours, incomeOverride } = s.settings;
  const st = incomeStats(s);
  const { cash, cardDebt } = netWorthNow(s);
  const have = Math.max(0, cash - cardDebt); // money you could spend today: accounts minus what the credit cards are owed
  const perDay = st.income / workDays;

  // "2 個月 5 天", "3 天", "5.5 小時", "1.4 年"
  const fmtWork = (price) => {
    const days = price / perDay;
    if (days < 1) return `${Math.max(0.1, round1(days * workHours))} 小時`;
    const total = Math.round(days), m = Math.floor(total / workDays), rem = total - m * workDays;
    if (m >= 12) return `${round1(total / workDays / 12)} 年`;
    return m >= 1 ? `${m} 個月${rem > 0 ? ` ${rem} 天` : ''}` : `${total} 天`;
  };
  const hoursOf = (price) => Math.round((price / perDay) * workHours);

  const active = s.wishes.filter((w) => !w.done).sort((a, b) => a.price - b.price);
  const done = s.wishes.filter((w) => w.done);

  // ---- how it is calculated ----
  const num = (v) => parseFloat(String(v).replace(/,/g, ''));
  root.append(h('div', { class: 'card' },
    h('div', { class: 'muted' }, '你的月收入'),
    st.income > 0
      ? [h('div', { class: 'big income' }, money(st.income, currency)),
        h('div', { class: 'muted' }, `${st.basis} · 每個工作天約 ${money(Math.round(perDay), currency)}，每小時約 ${money(Math.round(perDay / workHours), currency)}`)]
      : [h('div', { class: 'big' }, '—'), h('div', { class: 'muted' }, '還沒有收入紀錄。記下薪水，或在下方手動輸入月收入，就能算出要工作多久。')],
    h('details', { class: 'more', style: 'margin-top:12px' }, h('summary', {}, '計算設定'),
      h('div', { class: 'stack', style: 'margin-top:12px' },
        h('label', { class: 'field' }, `每月收入（留空 = 自動用收入紀錄${st.auto > 0 ? `：${money(Math.round(st.auto), currency)}` : ''}）`,
          h('input', {
            type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '自動', value: incomeOverride > 0 ? incomeOverride : '',
            onChange: (e) => { const v = num(e.target.value); update((x) => { x.settings.incomeOverride = v > 0 ? v : 0; }); },
          })),
        h('div', { class: 'row' },
          h('label', { class: 'field grow' }, '每月工作天數',
            h('input', {
              type: 'number', inputmode: 'numeric', min: '1', max: '31', value: workDays,
              onChange: (e) => { const v = Math.round(num(e.target.value)); if (v >= 1 && v <= 31) update((x) => { x.settings.workDays = v; }); },
            })),
          h('label', { class: 'field grow' }, '每天工作小時',
            h('input', {
              type: 'number', inputmode: 'decimal', min: '1', max: '24', step: 'any', value: workHours,
              onChange: (e) => { const v = num(e.target.value); if (v > 0 && v <= 24) update((x) => { x.settings.workHours = v; }); },
            })))))));

  // ---- add a wish ----
  const f = { name: '', price: '', note: '' };
  const add = () => {
    const name = f.name.trim(), price = num(f.price);
    if (!name) return toast('請輸入想買的東西');
    if (!(price > 0)) return toast('請輸入大於 0 的金額');
    update((x) => { x.wishes.push({ id: uid(), name, price, note: f.note.trim(), done: false }); });
    toast('已加入願望清單');
  };
  const addCard = h('div', { class: 'card stack' }, h('h2', {}, '新增願望'),
    h('label', { class: 'field' }, '想買什麼', h('input', { type: 'text', maxlength: '60', placeholder: '例如：新手機', onInput: (e) => { f.name = e.target.value; } })),
    h('div', { class: 'row' },
      h('label', { class: 'field grow' }, '價格', h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', onInput: (e) => { f.price = e.target.value; } })),
      h('label', { class: 'field grow' }, '備註（選填）', h('input', { type: 'text', maxlength: '100', onInput: (e) => { f.note = e.target.value; } }))),
    h('button', { class: 'btn-primary btn-block', onClick: add }, '加入願望清單'));

  // ---- the wishes ----
  const wishCard = (w) => {
    const pct = Math.min(100, Math.round((have / w.price) * 100));
    return h('div', { class: 'card wish' },
      h('div', { class: 'row' },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, w.name), w.note ? h('div', { class: 'muted' }, w.note) : null),
        h('div', { class: 'amt' }, money(w.price, currency))),
      st.income > 0 ? h('div', { class: 'wish-time' }, '要工作 ', h('b', {}, fmtWork(w.price)), h('span', { class: 'muted' }, `（約 ${hoursOf(w.price).toLocaleString('zh-TW')} 小時的薪水）`)) : null,
      st.saving != null ? h('div', { class: 'muted' }, st.saving > 0
        ? `照目前每月結餘 ${money(Math.round(st.saving), currency)} 存，約 ${round1(w.price / st.saving)} 個月`
        : '最近每月沒有結餘，先從控制支出開始吧') : null,
      h('div', { class: 'bar', role: 'img', 'aria-label': `目前可動用資金已達 ${pct}%` }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'muted' }, pct >= 100 ? '目前的資金已經買得起了！' : `目前可動用資金 ${money(have, currency)}，已達 ${pct}%`),
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'grow', onClick: () => update((x) => { x.wishes.find((y) => y.id === w.id).done = true; }) }, '已買到'),
        h('button', { onClick: () => edit(w) }, '編輯'),
        h('button', { class: 'btn-danger', 'aria-label': `刪除 ${w.name}`, onClick: () => { if (confirm(`刪除「${w.name}」？`)) update((x) => { x.wishes = x.wishes.filter((y) => y.id !== w.id); }); } }, '×')));
  };
  function edit(w) {
    const name = (prompt('想買什麼：', w.name) || '').trim();
    if (!name) return;
    const price = num(prompt('價格：', String(w.price)) || '');
    if (!(price > 0)) return toast('請輸入大於 0 的金額');
    update((x) => { Object.assign(x.wishes.find((y) => y.id === w.id), { name, price }); });
  }

  if (active.length) {
    const total = sum(active, (w) => w.price);
    root.append(h('div', { class: 'card' }, h('div', { class: 'muted' }, `${active.length} 個願望，全部加起來`),
      h('div', { class: 'big' }, money(total, currency)),
      st.income > 0 ? h('div', { class: 'muted' }, `約要工作 ${fmtWork(total)}`) : null));
    active.forEach((w) => root.append(wishCard(w)));
  } else {
    root.append(empty('還沒有願望。加入想買的東西，就能看到要工作多久才買得起。'));
  }
  root.append(addCard);

  if (done.length) {
    root.append(h('div', { class: 'card' }, h('h2', {}, '已買到'),
      done.map((w) => h('div', { class: 'tx' },
        h('div', { class: 'grow' }, h('div', { class: 'name done-name' }, w.name), h('div', { class: 'muted' }, money(w.price, currency))),
        h('button', { class: 'mini', onClick: () => update((x) => { x.wishes.find((y) => y.id === w.id).done = false; }) }, '還原'),
        h('button', { class: 'btn-danger mini', 'aria-label': `刪除 ${w.name}`, onClick: () => update((x) => { x.wishes = x.wishes.filter((y) => y.id !== w.id); }) }, '×')))));
  }
}
