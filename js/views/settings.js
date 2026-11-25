// Settings: currency, billing-period start day, categories, backup / restore.
import { h, download, today, uid } from '../util.js';
import { getState, update, replaceAll, exportJSON, exportCSV, exportInvestmentsCSV, defaults, INVEST_CATEGORY, INVEST_OUT_CATEGORY } from '../store.js';
import { toast } from '../components.js';

export const title = '設定';
const CURRENCIES = ['TWD', 'USD', 'EUR', 'JPY', 'GBP', 'CNY', 'HKD', 'SGD', 'KRW', 'AUD', 'CAD', 'THB', 'MYR'];

export function render(root) {
  const s = getState();

  const categoryCard = (type, label) => {
    const input = h('input', { type: 'text', maxlength: '40', placeholder: '新增類別，例如：🐶 寵物', style: 'margin:0' });
    const add = () => {
      const name = input.value.trim();
      if (!name) return;
      if (s.categories[type].includes(name)) return toast('已經存在');
      update((st) => st.categories[type].push(name));
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    return h('div', { class: 'card' }, h('h2', {}, label),
      s.categories[type].map((c) => h('div', { class: 'row', style: 'padding:6px 0;border-bottom:1px solid var(--line)' },
        h('div', { class: 'grow' }, c),
        // the Investment category is what links purchases to the Invest page, so it stays fixed
        (c === INVEST_CATEGORY && type === 'expense') || (c === INVEST_OUT_CATEGORY && type === 'income')
          ? h('span', { class: 'muted' }, '與投資頁連動')
          : [h('button', { 'aria-label': `重新命名 ${c}`, onClick: () => rename(type, c) }, '改名'),
            h('button', { class: 'btn-danger', 'aria-label': `刪除 ${c}`, onClick: () => removeCat(type, c) }, '×')])),
      h('div', { class: 'row', style: 'margin-top:10px' }, input, h('button', { onClick: add }, '新增')));
  };

  // ---- accounts: cash, bank accounts, each credit card… ----
  const accountsCard = () => {
    const nameIn = h('input', { type: 'text', maxlength: '40', placeholder: '新增帳戶，例如：富邦銀行', style: 'margin:0' });
    const openIn = h('input', { type: 'number', inputmode: 'decimal', step: 'any', placeholder: '起始餘額（選填）', style: 'margin:0' });
    const add = () => {
      const name = nameIn.value.trim();
      if (!name) return;
      if (s.accounts.some((a) => a.name === name)) return toast('已經存在');
      const opening = parseFloat(openIn.value || '0');
      update((st) => { st.accounts.push({ id: uid(), name, opening: Number.isFinite(opening) ? opening : 0 }); });
    };
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    return h('div', { class: 'card stack' }, h('h2', {}, '帳戶'),
      h('p', { class: 'muted', style: 'margin:0' }, '你的銀行帳戶。記支出或收入時直接輸入新名稱也會自動新增，下次會出現在建議裡。付款方式（現金、轉帳、信用卡）在每筆紀錄中選擇。起始餘額在「資產」頁設定。'),
      s.accounts.map((a) => h('div', { class: 'row', style: 'padding:6px 0;border-bottom:1px solid var(--line)' },
        h('div', { class: 'grow' }, a.name),
        h('button', { 'aria-label': `重新命名 ${a.name}`, onClick: () => renameAccount(a) }, '改名'),
        h('button', { class: 'btn-danger', 'aria-label': `刪除 ${a.name}`, onClick: () => removeAccount(a) }, '×'))),
      h('div', { class: 'stack' }, nameIn, h('div', { class: 'row' }, openIn, h('button', { onClick: add }, '新增'))));
  };
  function renameAccount(a) {
    const name = (prompt('新名稱：', a.name) || '').trim();
    if (!name || name === a.name) return;
    if (s.accounts.some((x) => x.name === name)) return toast('已經存在');
    update((st) => { st.accounts.find((x) => x.id === a.id).name = name; });
  }
  function removeAccount(a) {
    if (s.accounts.length <= 1) return toast('至少要保留一個帳戶');
    const target = s.accounts.find((x) => x.id !== a.id);
    const count = s.transactions.filter((t) => t.account === a.id).length;
    if (!confirm(count ? `刪除「${a.name}」？它的 ${count} 筆紀錄和起始餘額會移到「${target.name}」。` : `刪除「${a.name}」？`)) return;
    update((st) => {
      const to = st.accounts.find((x) => x.id === target.id);
      to.opening += st.accounts.find((x) => x.id === a.id).opening;
      st.transactions.forEach((t) => { if (t.account === a.id) t.account = target.id; });
      st.accounts = st.accounts.filter((x) => x.id !== a.id);
      if (st.settings.lastAccount === a.id) st.settings.lastAccount = '';
    });
  }

  function rename(type, oldName) {
    const name = (prompt('新名稱：', oldName) || '').trim();
    if (!name || name === oldName) return;
    if (s.categories[type].includes(name)) return toast('已經存在');
    update((st) => {
      st.categories[type] = st.categories[type].map((c) => (c === oldName ? name : c));
      st.transactions.forEach((t) => { if (t.type === type && t.category === oldName) t.category = name; });
    });
  }
  function removeCat(type, name) {
    if (!confirm(`移除「${name}」？過去的紀錄會保留原標籤。`)) return;
    update((st) => { st.categories[type] = st.categories[type].filter((c) => c !== name); });
  }

  function importFile(file) {
    if (!file) return;
    file.text().then((text) => {
      if (!confirm('要用這份備份取代所有現有資料嗎？')) return;
      try { replaceAll(JSON.parse(text)); toast('備份已還原'); } catch (e) { alert('無法讀取這個檔案：' + e.message); }
    });
  }

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onChange: (e) => importFile(e.target.files[0]) });

  root.append(
    h('div', { class: 'card stack' }, h('h2', {}, '一般'),
      h('label', { class: 'field' }, '貨幣',
        h('select', { value: s.settings.currency, onChange: (e) => update((st) => { st.settings.currency = e.target.value; }) },
          CURRENCIES.map((c) => h('option', { value: c }, c)))),
      h('label', { class: 'field' }, '每月起算日（1 = 日曆月，例如發薪日是 25 日就填 25）',
        h('input', {
          type: 'number', min: '1', max: '31', value: s.settings.startDay,
          onChange: (e) => { const v = Math.min(31, Math.max(1, parseInt(e.target.value) || 1)); update((st) => { st.settings.startDay = v; }); },
        }))),
    h('div', { class: 'card stack' }, h('h2', {}, '投資價格'),
      h('p', { class: 'muted', style: 'margin:0' }, '有代號和股數的投資，每天開啟 App 時會自動更新價格。加密貨幣不需要設定（CoinGecko）。股票和 ETF 需要在 twelvedata.com 申請免費金鑰。金鑰只存在這台裝置上，不會包含在備份中。只會傳送代號，不會傳送你的金額。'),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: s.settings.autoPrices, onChange: (e) => update((st) => { st.settings.autoPrices = e.target.checked; }, { silent: true }) }),
        h('span', {}, '每天自動更新價格一次')),
      h('label', { class: 'field' }, 'Twelve Data 金鑰（股票／ETF 用）',
        h('input', {
          type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '80', value: s.settings.twelveKey,
          onChange: (e) => {
            const v = e.target.value.trim();
            if (!/^[\w-]{0,80}$/.test(v)) return toast('這看起來不像金鑰');
            update((st) => { st.settings.twelveKey = v; }, { silent: true }); toast('已儲存！');
          },
        }))),
    accountsCard(),
    categoryCard('expense', '支出類別'),
    categoryCard('income', '收入類別'),
    h('div', { class: 'card stack' }, h('h2', {}, '你的資料'),
      h('p', { class: 'muted', style: 'margin:0' }, '資料只存在這台裝置的瀏覽器裡。請定期匯出備份，尤其是在清除瀏覽器資料之前。'),
      h('button', { class: 'btn-block', onClick: () => download(`moneyamplifier-backup-${today()}.json`, exportJSON()) }, '匯出備份 (JSON)'),
      h('button', { class: 'btn-block', onClick: () => download(`moneyamplifier-${today()}.csv`, exportCSV(), 'text/csv') }, '匯出收支紀錄 (CSV)'),
      h('button', { class: 'btn-block', onClick: () => download(`moneyamplifier-investments-${today()}.csv`, exportInvestmentsCSV(), 'text/csv') }, '匯出投資 (CSV)'),
      h('button', { class: 'btn-block', onClick: () => fileInput.click() }, '從備份還原…'),
      fileInput,
      h('button', {
        class: 'btn-danger btn-block',
        onClick: () => { if (confirm('要清除這台裝置上的所有資料嗎？此動作無法復原。') && confirm('真的要全部清除嗎？')) { replaceAll(defaults()); toast('所有資料已清除'); } },
      }, '清除所有資料')),
    h('p', { class: 'muted', style: 'text-align:center' }, 'MoneyAmplifier v0.1'));
}
