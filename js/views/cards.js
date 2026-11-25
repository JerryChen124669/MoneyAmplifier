// Credit cards. #/cards = all cards, #/cards/<id> = one card: what is owed, what is not billed yet, every bill, interest.
// A card purchase is spending on the day you make it but only becomes a debt (accounts payable); paying the bill
// is a transfer that clears the debt, so nothing is counted as spending twice (see cardSummary in store.js).
import { h, money, sum, uid, today } from '../util.js';
import { getState, update, cardSummary, removeCard, accountName, CARD_INTEREST } from '../store.js';
import { toast, empty, txRow } from '../components.js';

export const title = '信用卡';

const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');
const STATUS = { unbilled: '未出帳', due: '待繳款', overdue: '已逾期', paid: '已繳清' };
const round2 = (v) => Math.round(v * 100) / 100;

export function render(root, id) {
  const s = getState();
  if (!id) return list(root, s);
  const card = s.cards.find((c) => c.id === id);
  if (!card) { root.append(empty('找不到這張信用卡。'), h('a', { href: '#/cards' }, '← 回到信用卡')); return; }
  return detail(root, s, card);
}

/** Add / edit form: name, closing day, due day, yearly interest rate, the account that pays the bill, what is already owed, limit. */
function cardForm(s, card) {
  const f = {
    name: card ? card.name : '', closing: String(card ? card.closingDay : 5), due: String(card ? card.dueDay : 20), apr: String(card ? card.apr : 15),
    account: card ? card.account : s.accounts[0].id, opening: card && card.opening ? String(card.opening) : '', limit: card && card.limit ? String(card.limit) : '',
  };
  const input = (key, props) => h('input', { ...props, value: f[key], onInput: (e) => { f[key] = e.target.value; } });
  const num = (v) => parseFloat(String(v).replace(/,/g, '') || '0');
  const save = () => {
    const name = f.name.trim(), closing = Math.round(num(f.closing)), due = Math.round(num(f.due)), apr = num(f.apr), opening = num(f.opening), limit = num(f.limit);
    if (!name) return toast('請輸入信用卡名稱');
    if (!(closing >= 1 && closing <= 31) || !(due >= 1 && due <= 31)) return toast('結帳日和繳款日要在 1 到 31 之間');
    if (!(apr >= 0 && apr <= 100) || !(opening >= 0) || !(limit >= 0)) return toast('請檢查數字');
    if (s.cards.some((c) => c.name.toLowerCase() === name.toLowerCase() && (!card || c.id !== card.id))) return toast('已經有同名的信用卡');
    const data = { name, closingDay: closing, dueDay: due, apr, account: f.account, opening, limit };
    if (card) { update((st) => { Object.assign(st.cards.find((c) => c.id === card.id), data); }); toast('已儲存！'); return; }
    const newId = uid();
    update((st) => { st.cards.push({ id: newId, interestDate: '', ...data }); }, { silent: true });
    location.hash = `#/cards/${newId}`;
    toast('已新增信用卡');
  };
  return h('div', { class: 'stack' },
    h('label', { class: 'field' }, '信用卡名稱', input('name', { type: 'text', maxlength: '40', placeholder: '例如：國泰 CUBE 卡' })),
    h('div', { class: 'row' },
      h('label', { class: 'field grow' }, '結帳日（每月幾號）', input('closing', { type: 'number', inputmode: 'numeric', min: '1', max: '31' })),
      h('label', { class: 'field grow' }, '繳款日（每月幾號）', input('due', { type: 'number', inputmode: 'numeric', min: '1', max: '31' }))),
    h('label', { class: 'field' }, '從哪個帳戶繳款',
      h('select', { value: f.account, onChange: (e) => { f.account = e.target.value; } }, s.accounts.map((a) => h('option', { value: a.id }, a.name)))),
    h('div', { class: 'row' },
      h('label', { class: 'field grow' }, '循環利率（年利率 %）', input('apr', { type: 'number', inputmode: 'decimal', step: 'any', min: '0', max: '100' })),
      h('label', { class: 'field grow' }, '額度（選填）', input('limit', { type: 'number', inputmode: 'decimal', step: 'any', min: '0' }))),
    h('label', { class: 'field' }, '目前已欠、還沒繳的金額（選填）', input('opening', { type: 'number', inputmode: 'decimal', step: 'any', min: '0' })),
    h('p', { class: 'muted', style: 'margin:0' }, '結帳日當天的消費算在當期帳單；結帳日之後的消費算下一期。'),
    h('button', { class: 'btn-primary btn-block', onClick: save }, card ? '儲存卡片設定' : '新增信用卡'));
}

function list(root, s) {
  const { currency } = s.settings;
  const rows = s.cards.map((c) => [c, cardSummary(s, c)]);
  if (rows.length) {
    root.append(h('div', { class: 'card' },
      h('div', { class: 'muted' }, '信用卡應付帳款'),
      h('div', { class: `big ${sum(rows, (r) => r[1].payable) > 0 ? 'expense' : ''}` }, money(sum(rows, (r) => r[1].payable), currency)),
      h('div', { class: 'stats two', style: 'margin-top:12px' },
        h('div', {}, h('span', { class: 'muted' }, '未出帳'), h('b', {}, money(sum(rows, (r) => r[1].unbilled), currency))),
        h('div', {}, h('span', { class: 'muted' }, '已出帳待繳'), h('b', { class: 'expense' }, money(sum(rows, (r) => r[1].billed), currency)))),
      h('p', { class: 'muted', style: 'margin:10px 0 0' }, '刷卡先列入應付帳款，繳款時才從帳戶扣款。支出只在刷卡那天算一次，繳款不會再算支出。')));
  }
  rows.forEach(([c, sm]) => root.append(h('a', { class: 'card card-link', href: `#/cards/${c.id}` },
    h('div', { class: 'row' },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, c.name),
        h('div', { class: 'muted' }, `結帳日 ${c.closingDay} 日 · 繳款日 ${c.dueDay} 日 · ${accountName(s, c.account)}`)),
      h('div', { class: `amt ${sm.payable > 0 ? 'expense' : ''}` }, money(sm.payable, currency))),
    sm.nextDue ? h('div', { class: `muted ${sm.nextDue.status === 'overdue' ? 'expense' : ''}`, style: 'margin-top:6px' },
      `${sm.nextDue.status === 'overdue' ? '已逾期，應於' : '請於'} ${md(sm.nextDue.due)} 前繳 ${money(sm.nextDue.unpaid, currency)}`) : null)));
  if (!rows.length) root.append(empty('還沒有信用卡。新增後，刷卡會先列入應付帳款，繳款時再沖銷。'));
  root.append(h('details', { class: 'more', open: rows.length ? null : true, style: 'margin-top:4px' }, h('summary', {}, '新增信用卡'), h('div', { style: 'margin-top:12px' }, cardForm(s, null))));
}

function detail(root, s, card) {
  const { currency } = s.settings;
  const sm = cardSummary(s, card);
  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  root.append(h('a', { href: '#/cards', class: 'muted', style: 'display:inline-block;margin:0 0 10px' }, '← 所有信用卡'));

  root.append(h('div', { class: 'card' },
    h('div', { class: 'muted' }, `${card.name} · 應付帳款`),
    h('div', { class: `big ${sm.payable > 0 ? 'expense' : ''}` }, money(sm.payable, currency)),
    sm.credit > 0 ? h('div', { class: 'muted' }, `已多繳 ${money(sm.credit, currency)}，會抵下一期帳單`) : null,
    h('div', { class: 'stats two', style: 'margin-top:12px' },
      h('div', {}, h('span', { class: 'muted' }, '未出帳'), h('b', {}, money(sm.unbilled, currency))),
      h('div', {}, h('span', { class: 'muted' }, '已出帳待繳'), h('b', { class: sm.billed > 0 ? 'expense' : '' }, money(sm.billed, currency)))),
    sm.nextDue ? h('div', { class: `muted ${sm.nextDue.status === 'overdue' ? 'expense' : ''}`, style: 'margin-top:10px' },
      `${sm.nextDue.status === 'overdue' ? '已逾期！應於' : '下一次繳款：'} ${md(sm.nextDue.due)} 前繳 ${money(sm.nextDue.unpaid, currency)}`) : null,
    sm.available != null ? h('div', { class: 'muted', style: 'margin-top:4px' }, `可用額度 ${money(sm.available, currency)} / ${money(card.limit, currency)}`) : null,
    h('div', { class: 'row', style: 'margin-top:14px' },
      h('a', { class: 'btn btn-primary grow btn-link', href: `#/add/pay-${card.id}` }, '繳款'),
      h('a', { class: 'btn grow btn-link', href: `#/add/card-${card.id}` }, '記一筆刷卡'))));

  // interest: estimated from overdue bills, then recorded as one more charge on the card (counted as spending once)
  if (sm.interestEst >= 1) {
    root.append(h('div', { class: 'card stack' }, h('h2', {}, '逾期利息'),
      h('div', {}, `逾期帳單預估利息約 ${money(round2(sm.interestEst), currency)}（年利率 ${card.apr}%）`),
      h('div', { class: 'muted' }, '按「未繳金額 × 年利率 × 逾期天數 ÷ 365」估算，實際金額以銀行帳單為準。記錄後會列入這張卡的帳單，並算一次支出。'),
      h('button', {
        class: 'btn-block', onClick: () => {
          update((st) => {
            const c = st.cards.find((x) => x.id === card.id);
            st.transactions.push({
              id: uid(), date: today(), type: 'expense', amount: round2(sm.interestEst), category: CARD_INTEREST, note: '預估逾期利息',
              account: c.account, method: 'card', card: c.id, kind: 'variable',
            });
            c.interestDate = today();
          }, { silent: true });
          toast('已記入利息');
          rerender();
        },
      }, '把預估利息記入帳單')));
  }

  // every bill, newest first; tap one to see what is on it
  root.append(h('div', { class: 'card' }, h('h2', {}, '各期帳單'),
    sm.statements.length ? sm.statements.map((st) => h('details', { class: 'stmt' },
      h('summary', {},
        h('div', { class: 'grow' },
          h('div', { class: 'name' }, st.key === 'opening' ? '期初未繳' : `${st.key.replace('-', ' 年 ')} 月帳單`),
          h('div', { class: 'muted' }, st.key === 'opening' ? '開始使用前已欠的金額' : `結帳 ${md(st.close)} · 繳款 ${md(st.due)}`
            + (st.paid > 0 && st.unpaid > 0 ? ` · 已繳 ${money(st.paid, currency)}` : ''))),
        h('div', { class: 'stmt-amt' }, h('b', {}, money(st.charges, currency)), h('span', { class: `badge ${st.status}` }, STATUS[st.status]))),
      st.items.length ? h('div', { class: 'stmt-items' }, [...st.items].sort((a, b) => b.date.localeCompare(a.date)).map(txRow)) : null))
      : empty('還沒有刷卡紀錄。')));

  root.append(h('div', { class: 'card' }, h('h2', {}, '繳款紀錄'),
    sm.payments.length ? sm.payments.map(txRow) : empty('還沒有繳款紀錄。')));

  root.append(h('details', { class: 'more', style: 'margin-bottom:12px' }, h('summary', {}, '卡片設定'), h('div', { style: 'margin-top:12px' }, cardForm(s, card))));
  root.append(h('button', {
    class: 'btn-danger btn-block',
    onClick: () => {
      if (!confirm(`刪除「${card.name}」？這張卡的刷卡紀錄會改成直接從帳戶扣款，繳款紀錄會一併移除（總金額不變）。`)) return;
      update((st) => removeCard(st, card.id), { silent: true });
      toast('已刪除');
      location.hash = '#/cards';
    },
  }, '刪除這張信用卡'));
}
