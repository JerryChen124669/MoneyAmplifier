// Add / edit a transaction. #/add = new, #/add/<id> = edit existing,
// #/add/buy-<holdingId> and #/add/sell-<holdingId> = buy more of / cash out of a holding (links from the Invest page).
// Expenses in the "Investment" category and income in the "Investment cash-out" category move money between
// the daily account and a holding on the Invest page, so both pages always stay in step.
import { h, uid, today, money } from '../util.js';
import { getState, update, INVEST_CATEGORY, INVEST_OUT_CATEGORY, INVEST_TYPES, TYPE_EMOJI, TYPE_LABEL, commitTx, removeTx, ensureAccount } from '../store.js';
import { toast, accountField, methodField } from '../components.js';

export const title = '記一筆';

const numOf = (v) => parseFloat(String(v ?? '').replace(/,/g, ''));

export function render(root, id) {
  const s = getState();
  const { currency } = s.settings;
  const preset = /^(buy|sell)-/.test(id || '') ? id.split('-')[0] : null;
  const presetHolding = preset ? id.slice(preset.length + 1) : null;
  const existing = id && !preset ? s.transactions.find((t) => t.id === id) : null;

  // the account is typed (or picked from the ones you used before); a new name creates the account when you save
  const acctNameOf = (id) => (s.accounts.find((a) => a.id === id) || s.accounts[0]).name;
  const lastAcct = s.accounts.some((a) => a.id === s.settings.lastAccount) ? s.settings.lastAccount : s.accounts[0].id;
  const form = existing
    ? { ...existing, amount: String(existing.amount), accountName: acctNameOf(existing.account), method: existing.method || '' }
    : { type: 'expense', amount: '', category: '', date: today(), note: '', accountName: acctNameOf(lastAcct), method: s.settings.lastMethod || '' };
  Object.assign(form, { holding: 'new', hName: '', hType: 'Stock', hInst: '', hTicker: '', shares: '', removed: '' });
  if (existing && existing.investId) {
    if (s.investments.some((i) => i.id === existing.investId)) form.holding = existing.investId;
    if (existing.shares) form.shares = String(existing.shares);
    if (existing.type === 'income' && existing.holdValue != null) form.removed = String(existing.holdValue);
  }
  if (preset && s.investments.some((i) => i.id === presetHolding)) {
    form.type = preset === 'buy' ? 'expense' : 'income';
    form.category = preset === 'buy' ? INVEST_CATEGORY : INVEST_OUT_CATEGORY;
    form.holding = presetHolding;
  }

  const isBuy = () => form.type === 'expense' && form.category === INVEST_CATEGORY;
  const isSell = () => form.type === 'income' && form.category === INVEST_OUT_CATEGORY;
  const holdLabel = (i) => `${TYPE_EMOJI[i.type]} ${i.name}${i.institution ? ' · ' + i.institution : ''}`;

  function buyCard() {
    const institutions = [...new Set(s.investments.map((i) => i.institution).filter(Boolean))];
    return h('div', { class: 'card stack' },
      h('h2', {}, '投入：記入投資頁'),
      h('p', { class: 'muted', style: 'margin:0' }, '日常帳戶減少，投資增加相同金額，淨資產不變。'),
      h('label', { class: 'field' }, '投資項目',
        h('select', { value: form.holding, onChange: (e) => { form.holding = e.target.value; draw(); } },
          h('option', { value: 'new' }, '＋ 新增投資'),
          s.investments.map((i) => h('option', { value: i.id }, holdLabel(i))))),
      form.holding === 'new' ? [
        h('label', { class: 'field' }, '名稱（例如：台積電、0050、美國公債 10 年）', h('input', { type: 'text', maxlength: '60', value: form.hName, onInput: (e) => { form.hName = e.target.value; } })),
        h('label', { class: 'field' }, '類型',
          h('select', { value: form.hType, onChange: (e) => { form.hType = e.target.value; } }, INVEST_TYPES.map((t) => h('option', { value: t }, `${TYPE_EMOJI[t]} ${TYPE_LABEL[t]}`)))),
        h('label', { class: 'field' }, '管理機構（銀行、券商、基金公司…）',
          h('input', { type: 'text', maxlength: '60', list: 'add-institutions', value: form.hInst, onInput: (e) => { form.hInst = e.target.value; } }),
          h('datalist', { id: 'add-institutions' }, institutions.map((i) => h('option', { value: i })))),
        h('label', { class: 'field' }, '代號（選填，用於自動更新價格：AAPL、VOO，加密貨幣填 bitcoin）',
          h('input', { type: 'text', maxlength: '30', autocapitalize: 'off', value: form.hTicker, onInput: (e) => { form.hTicker = e.target.value; } })),
      ] : null,
      h('label', { class: 'field' }, '買入股數／單位（選填）',
        h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: form.shares, onInput: (e) => { form.shares = e.target.value; } })));
  }

  function sellCard() {
    if (!s.investments.length) return h('div', { class: 'card' }, h('p', { class: 'muted', style: 'margin:0' }, '投資頁還沒有可以贖回的項目。'));
    if (form.holding === 'new') form.holding = s.investments[0].id;
    const hold = s.investments.find((i) => i.id === form.holding);
    return h('div', { class: 'card stack' },
      h('h2', {}, '贖回：來自投資頁'),
      h('p', { class: 'muted', style: 'margin:0' }, '上面的金額是你收到的現金，會存入日常帳戶，下方的價值會從投資扣除。若拿回的金額比原本價值高，差額就是獲利。'),
      h('label', { class: 'field' }, '投資項目',
        h('select', { value: form.holding, onChange: (e) => { form.holding = e.target.value; draw(); } },
          s.investments.map((i) => h('option', { value: i.id }, `${holdLabel(i)} (${money(i.amount, currency)})`)))),
      h('label', { class: 'field' }, '從投資扣除的價值（留空 = 與收到的金額相同）',
        h('div', { class: 'row' },
          h('input', { type: 'text', inputmode: 'decimal', placeholder: String(form.amount || '0'), style: 'margin:0', value: form.removed, onInput: (e) => { form.removed = e.target.value; } }),
          h('button', { type: 'button', onClick: () => { form.removed = String(hold.amount); draw(); } }, '全部'))),
      hold && hold.shares > 0 ? h('label', { class: 'field' }, `賣出股數／單位（留空 = 按比例；你持有 ${hold.shares}）`,
        h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: form.shares, onInput: (e) => { form.shares = e.target.value; } })) : null);
  }

  function draw() {
    const cats = [...s.categories[form.type]];
    if (form.category && !cats.includes(form.category)) cats.push(form.category); // keep a since-deleted category visible
    const amountEl = h('input', {
      class: 'amount-input', type: 'text', inputmode: 'decimal', placeholder: '0', value: form.amount, 'aria-label': isSell() ? '收到的金額' : '金額',
      onInput: (e) => { form.amount = e.target.value; },
    });
    root.replaceChildren(h('div', { class: 'stack' },
      h('div', { class: 'segmented' },
        ['expense', 'income'].map((t) => h('button', {
          class: form.type === t ? 'on' : '',
          onClick: () => { if (form.type !== t) { form.type = t; form.category = ''; if (t === 'income' && form.method === 'card') form.method = ''; draw(); } },
        }, t === 'expense' ? '支出' : '收入'))),
      h('div', { class: 'card' }, amountEl),
      // which bank account, then how it was paid (cash / transfer / credit card), then the category
      h('div', { class: 'card stack' }, h('h2', {}, '帳戶'),
        accountField(form, { label: form.type === 'expense' ? '從哪個帳戶支付？' : '存入哪個帳戶？' }),
        methodField(form, { income: form.type === 'income', label: form.type === 'expense' ? '怎麼付款？' : '怎麼收到？' })),
      h('div', { class: 'card' }, h('h2', {}, '類別'),
        h('div', { class: 'chips' }, cats.map((c) => h('button', {
          class: `chip ${form.category === c ? 'on' : ''}`,
          onClick: () => { form.category = c; draw(); },
        }, c)))),
      isBuy() ? buyCard() : isSell() ? sellCard() : null,
      h('div', { class: 'card stack' },
        h('label', { class: 'field' }, '日期', h('input', { type: 'date', value: form.date, onChange: (e) => { form.date = e.target.value; } })),
        h('label', { class: 'field' }, '備註（選填）', h('input', { type: 'text', maxlength: '200', value: form.note, onInput: (e) => { form.note = e.target.value; } }))),
      h('button', { class: 'btn-primary btn-block', onClick: save }, existing ? '儲存變更' : '儲存'),
      existing ? h('button', { class: 'btn-danger btn-block', onClick: remove }, '刪除') : null));
    if (!existing && !form.amount) amountEl.focus();
  }

  function save() {
    const amount = numOf(form.amount);
    if (!(amount > 0)) return toast('請輸入大於 0 的金額');
    if (!form.category) return toast('請選擇類別');
    if (!form.date) return toast('請選擇日期');
    if (!form.accountName.trim()) return toast('請輸入或選擇帳戶');
    const record = { id: existing ? existing.id : uid(), type: form.type, amount, category: form.category, date: form.date, note: form.note.trim(), method: form.method };
    let link = null;
    if (isBuy()) {
      if (form.holding === 'new' && !form.hName.trim()) return toast('請輸入買了什麼，例如台積電');
      const shares = numOf(form.shares);
      link = {
        pick: form.holding === 'new' ? { name: form.hName, type: form.hType, institution: form.hInst, ticker: form.hTicker } : { id: form.holding },
        holdValue: amount, shares: shares > 0 ? shares : 0,
      };
    } else if (isSell()) {
      const hold = s.investments.find((i) => i.id === form.holding);
      if (!hold) return toast('請選擇贖回的投資項目');
      // when editing, the old cash-out is put back first, so allow up to value + what it took off
      const room = hold.amount + (existing && existing.investId === hold.id ? existing.holdValue ?? existing.amount : 0);
      const removed = Math.min(form.removed.trim() ? numOf(form.removed) : amount, room);
      if (!(removed > 0)) return toast('這項投資已沒有可扣除的價值');
      const heldShares = hold.shares + (existing && existing.investId === hold.id ? existing.shares || 0 : 0);
      let shares = numOf(form.shares);
      if (!(shares > 0)) shares = heldShares > 0 && room > 0 ? heldShares * Math.min(1, removed / room) : 0;
      link = { pick: { id: hold.id }, holdValue: removed, shares };
    }
    update((st) => {
      record.account = ensureAccount(st, form.accountName); // a name you have not used before becomes a new account
      commitTx(st, record, existing, link);
      st.settings.lastAccount = record.account;
      st.settings.lastMethod = form.method;
    }, { silent: true });
    toast(link ? (isBuy() ? '已儲存！已加到投資' : '已儲存！已從投資扣除') : '已儲存！');
    if (existing) location.hash = '#/history';
    else if (preset) location.hash = '#/invest';
    else {
      Object.assign(form, { amount: '', note: '', holding: 'new', hName: '', hType: 'Stock', hInst: '', hTicker: '', shares: '', removed: '' });
      draw();
    }
  }

  function remove() {
    const linked = !!existing.investId;
    if (!confirm(linked ? '刪除這筆紀錄？投資頁會恢復到這筆之前的樣子。' : '刪除這筆紀錄？')) return;
    update((st) => removeTx(st, existing), { silent: true });
    toast('已刪除');
    location.hash = '#/history';
  }

  if (id && !preset && !existing) { root.append(h('div', { class: 'empty' }, '找不到這筆紀錄。')); return; }
  draw();
}
