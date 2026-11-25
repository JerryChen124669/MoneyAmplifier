// Investments: stocks, ETFs, bonds, funds… each with a name, current value and the institution holding it.
// Money moves between your accounts and a holding in three ways, all recorded as normal Expense / Income entries:
//   + Add investment (first purchase), + Buy more, and 💵 Cash out. Edits and deletes are undone on the holding too.
// Holdings with a ticker + shares are re-priced automatically (see prices.js).
import { h, uid, today, money, sum } from '../util.js';
import { getState, update, commitTx, ensureAccount, INVEST_TYPES, TYPE_EMOJI, TYPE_LABEL, INVEST_CATEGORY, INVEST_OUT_CATEGORY, investTotal, isAuto, isTransfer } from '../store.js';
import { toast, empty, donut, flowRow, accountField, methodField } from '../components.js';
import { refreshPrices } from '../prices.js';

export const title = '投資';

const numOf = (v) => parseFloat(String(v ?? '').replace(/,/g, ''));

export function render(root) {
  const s = getState();
  const { currency } = s.settings;
  const total = investTotal(s);
  // mode: null | 'new' | 'edit' | 'buy' | 'sell'; f holds the form fields so they survive a redraw
  const view = { group: 'type', mode: null, id: null, f: null };
  let chart = null;
  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const held = () => s.investments.filter((i) => i.amount > 0);
  const lastAcctName = () => (s.accounts.find((a) => a.id === s.settings.lastAccount) || s.accounts[0]).name;
  // which bank account (typed once, picked afterwards) and how it was paid
  const acctBlock = (f, { label, income = false }) => h('div', { class: 'stack' }, accountField(f, { label }), methodField(f, { income }));

  function open(mode, id = null) {
    view.mode = mode;
    view.id = id;
    if (mode === 'buy' || mode === 'sell') {
      view.f = { id: id || (mode === 'sell' ? (held()[0] || {}).id : (s.investments[0] || {}).id), amount: '', removed: '', shares: '', date: today(), note: '', accountName: lastAcctName(), method: s.settings.lastMethod || '' };
    } else if (mode === 'new') {
      view.f = { name: '', type: 'Stock', institution: '', ticker: '', shares: '', amount: '', date: today(), record: true, accountName: lastAcctName(), method: s.settings.lastMethod || '' };
    } else if (mode === 'edit') {
      const i = s.investments.find((x) => x.id === id);
      view.f = { ...i, amount: String(i.amount), shares: i.shares ? String(i.shares) : '' };
    }
    draw();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const close = () => { view.mode = null; view.f = null; draw(); };

  function draw() {
    if (chart) chart.destroy();
    chart = null;
    root.replaceChildren();

    const auto = s.investments.filter(isAuto);
    const lastPriced = auto.map((i) => i.priceDate).filter(Boolean).sort().pop();
    const refreshBtn = h('button', { class: 'btn-block', style: 'margin-top:10px' }, '↻ 立即更新價格');
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true; refreshBtn.textContent = '更新中…';
      try {
        const r = await refreshPrices();
        toast(r.errors.length ? r.errors[0] : `已更新 ${r.updated} 筆價格`);
      } catch (e) { toast('無法更新價格'); }
      refreshBtn.disabled = false; refreshBtn.textContent = '↻ 立即更新價格';
    });
    root.append(h('div', { class: 'card' },
      h('div', { class: 'muted' }, '投資總值'),
      h('div', { class: 'big' }, money(total, currency)),
      h('div', { class: 'muted' }, `${s.investments.length} 項投資`
        + (auto.length ? ` · ${auto.length} 項自動報價${lastPriced ? '，最後更新 ' + lastPriced : ''}` : '')),
      auto.length ? refreshBtn : null));

    if (view.mode === 'new' || view.mode === 'edit') root.append(editCard());
    else if (view.mode === 'buy' || view.mode === 'sell') root.append(moveCard());
    else {
      root.append(h('div', { class: 'row', style: 'margin-bottom:14px' },
        h('button', { class: 'btn-primary grow', onClick: () => open('new') }, '+ 新增投資'),
        h('button', { class: 'grow', disabled: !held().length, onClick: () => open('sell') }, '贖回')));
    }

    if (!s.investments.length) {
      root.append(h('div', { class: 'card' }, empty('還沒有投資，新增股票、ETF、債券、基金…')));
      return;
    }

    // composition
    const groupBy = view.group === 'type' ? (i) => TYPE_LABEL[i.type] : (i) => i.institution || '未填機構';
    const totals = {};
    s.investments.forEach((i) => { const k = groupBy(i); totals[k] = (totals[k] || 0) + i.amount; });
    const entries = Object.entries(totals).filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1]);
    chart = entries.length ? donut(entries, currency) : null;
    root.append(h('div', { class: 'card' },
      h('h2', {}, '投資組成'),
      h('div', { class: 'segmented', style: 'margin-bottom:10px' },
        [['type', '依類型'], ['institution', '依機構']].map(([k, label]) =>
          h('button', { class: view.group === k ? 'on' : '', onClick: () => { view.group = k; draw(); } }, label))),
      chart ? chart.el : empty('所有投資的價值都是 0。')));

    // list, grouped by institution; every holding has its own Buy more / Cash out buttons
    const byInst = {};
    s.investments.forEach((i) => (byInst[i.institution || '未填機構'] ||= []).push(i));
    root.append(h('h2', { class: 'section-title' }, '持有項目'));
    Object.entries(byInst).sort((a, b) => sum(b[1], (x) => x.amount) - sum(a[1], (x) => x.amount)).forEach(([inst, items]) => {
      root.append(h('div', { class: 'day-head' }, h('span', {}, inst), h('span', {}, money(sum(items, (x) => x.amount), currency))),
        h('div', { class: 'card', style: 'padding:4px 16px;margin-bottom:0' },
          [...items].sort((a, b) => b.amount - a.amount).map((i) => h('div', { class: `holding${i.amount <= 0 ? ' sold-out' : ''}` },
            h('button', { class: 'tx tx-btn', onClick: () => open('edit', i.id) },
              h('div', { class: 'grow' },
                h('div', { class: 'name' }, `${TYPE_EMOJI[i.type]} ${i.name}${i.amount <= 0 ? ' · 已全數贖回' : ''}`),
                h('div', { class: 'muted' }, isAuto(i) && i.price
                  ? `${i.shares} × ${i.price}${i.priceCur ? ' ' + i.priceCur : ''} · ${i.priceDate}`
                  : `${TYPE_LABEL[i.type]} · 更新於 ${i.updated}`)),
              h('div', { class: 'amt' }, money(i.amount, currency))),
            h('div', { class: 'actions' },
              h('button', { class: 'mini', onClick: () => open('buy', i.id) }, '＋ 加碼'),
              i.amount > 0 ? h('button', { class: 'mini', onClick: () => open('sell', i.id) }, '贖回') : null)))));
    });

    // recent money in / out
    const moves = s.transactions.filter(isTransfer).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    root.append(h('h2', { class: 'section-title' }, '資金進出'),
      h('div', { class: 'card', style: 'margin-top:8px' },
        moves.length ? moves.map((t) => flowRow(t, { meta: t.date }))
          : empty('還沒有紀錄。加碼或贖回後會顯示在這裡。'),
        moves.length ? h('a', { href: '#/history', class: 'muted' }, '到紀錄頁查看全部 →') : null));
  }

  // ---- Buy more / Cash out ----
  function moveCard() {
    const sell = view.mode === 'sell';
    const f = view.f;
    const choices = sell ? held() : s.investments;
    const hold = s.investments.find((i) => i.id === f.id);
    const label = (i) => `${TYPE_EMOJI[i.type]} ${i.name}${i.institution ? ' · ' + i.institution : ''} (${money(i.amount, currency)})`;

    const save = () => {
      const amount = numOf(f.amount);
      if (!hold) return toast('請選擇投資項目');
      if (!(amount > 0)) return toast(sell ? '請輸入收到的現金' : '請輸入支付金額');
      if (!f.accountName.trim()) return toast('請輸入或選擇帳戶');
      const base = { id: uid(), amount, date: f.date || today(), note: f.note.trim(), method: f.method };
      if (sell) {
        const removed = Math.min(f.removed.trim() ? numOf(f.removed) : amount, hold.amount);
        if (!(removed > 0)) return toast('這項投資已沒有可扣除的價值');
        let shares = numOf(f.shares);
        if (!(shares > 0)) shares = hold.shares > 0 && hold.amount > 0 ? hold.shares * Math.min(1, removed / hold.amount) : 0;
        const rec = { ...base, type: 'income', category: INVEST_OUT_CATEGORY };
        update((st) => { rec.account = ensureAccount(st, f.accountName); commitTx(st, rec, null, { pick: { id: hold.id }, holdValue: removed, shares }); st.settings.lastAccount = rec.account; st.settings.lastMethod = f.method; }, { silent: true });
        toast('已贖回！已記入收入');
      } else {
        const shares = numOf(f.shares);
        const rec = { ...base, type: 'expense', category: INVEST_CATEGORY };
        update((st) => { rec.account = ensureAccount(st, f.accountName); commitTx(st, rec, null, { pick: { id: hold.id }, holdValue: amount, shares: shares > 0 ? shares : 0 }); st.settings.lastAccount = rec.account; st.settings.lastMethod = f.method; }, { silent: true });
        toast('已儲存！已記入支出');
      }
      rerender();
    };

    return h('div', { class: 'card stack' },
      h('h2', {}, sell ? '贖回' : '＋ 加碼'),
      h('p', { class: 'muted', style: 'margin:0' }, sell
        ? '收到的現金會以收入記入帳戶，扣除的價值會從投資中減少。若拿回的金額比原本價值高，差額就是你的獲利。'
        : '支付的金額會以支出從帳戶扣除並加到這項投資，所以淨資產不變。'),
      h('label', { class: 'field' }, '投資項目',
        h('select', { value: f.id, onChange: (e) => { f.id = e.target.value; draw(); } }, choices.map((i) => h('option', { value: i.id }, label(i))))),
      acctBlock(f, { label: sell ? '現金存入哪個帳戶？' : '從哪個帳戶支付？', income: sell }),
      h('label', { class: 'field' }, sell ? '收到的現金' : '支付金額',
        h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: f.amount, onInput: (e) => { f.amount = e.target.value; } })),
      sell ? h('label', { class: 'field' }, '從投資扣除的價值（留空 = 與收到的現金相同）',
        h('div', { class: 'row' },
          h('input', { type: 'text', inputmode: 'decimal', placeholder: '與收到的現金相同', style: 'margin:0', value: f.removed, onInput: (e) => { f.removed = e.target.value; } }),
          h('button', { type: 'button', onClick: () => { f.removed = String(hold ? hold.amount : ''); draw(); } }, '全部'))) : null,
      !sell || (hold && hold.shares > 0) ? h('label', { class: 'field' },
        sell ? `賣出股數／單位（留空 = 按比例；你持有 ${hold.shares}）` : '買入股數／單位（選填）',
        h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: f.shares, onInput: (e) => { f.shares = e.target.value; } })) : null,
      h('label', { class: 'field' }, '日期', h('input', { type: 'date', value: f.date, onChange: (e) => { f.date = e.target.value; } })),
      h('label', { class: 'field' }, '備註（選填）', h('input', { type: 'text', maxlength: '200', value: f.note, onInput: (e) => { f.note = e.target.value; } })),
      h('button', { class: 'btn-primary btn-block', onClick: save }, sell ? '贖回' : '儲存'),
      h('button', { class: 'btn-block', onClick: close }, '取消'));
  }

  // ---- add / edit a holding ----
  function editCard() {
    const existing = view.mode === 'edit' ? s.investments.find((i) => i.id === view.id) : null;
    const f = view.f;
    const institutions = [...new Set(s.investments.map((i) => i.institution).filter(Boolean))];

    const save = () => {
      const amount = numOf(f.amount);
      const shares = numOf(f.shares);
      if (!f.name.trim()) return toast('請輸入名稱');
      if (!(amount >= 0)) return toast('請輸入目前金額');
      if (f.ticker.trim() && !(shares > 0)) return toast('要自動報價，請輸入持有的股數／單位');
      const base = { name: f.name.trim(), type: f.type, institution: f.institution.trim(), ticker: f.ticker.trim(), shares: shares > 0 ? shares : 0 };
      if (existing) {
        update((st) => { Object.assign(st.investments.find((i) => i.id === existing.id), base, { amount, updated: today() }); }, { silent: true });
      } else if (f.record && amount > 0) {
        // a purchase: records an Expense and the holding together
        const rec = { id: uid(), type: 'expense', amount, category: INVEST_CATEGORY, date: f.date || today(), note: '', method: f.method };
        update((st) => { rec.account = ensureAccount(st, f.accountName); commitTx(st, rec, null, { pick: base, holdValue: amount, shares: base.shares }); st.settings.lastAccount = rec.account; st.settings.lastMethod = f.method; }, { silent: true });
      } else {
        update((st) => { st.investments.push({ id: uid(), ...base, amount, updated: today(), priceCur: '', price: 0, priceDate: '' }); }, { silent: true });
      }
      toast(!existing && f.record && amount > 0 ? '已儲存！已記為支出' : '已儲存！');
      rerender();
    };
    const remove = () => {
      if (!confirm(`刪除「${existing.name}」？它過去的支出／收入紀錄仍會留在紀錄頁。`)) return;
      update((st) => { st.investments = st.investments.filter((i) => i.id !== existing.id); }, { silent: true });
      rerender();
    };

    return h('div', { class: 'card stack' },
      h('h2', {}, existing ? '編輯投資' : '新增投資'),
      h('label', { class: 'field' }, '名稱（例如：台積電、0050、美國公債 10 年）', h('input', { type: 'text', maxlength: '60', value: f.name, onInput: (e) => { f.name = e.target.value; } })),
      h('label', { class: 'field' }, '類型',
        h('select', { value: f.type, onChange: (e) => { f.type = e.target.value; } }, INVEST_TYPES.map((t) => h('option', { value: t }, `${TYPE_EMOJI[t]} ${TYPE_LABEL[t]}`)))),
      h('label', { class: 'field' }, '管理機構（銀行、券商、基金公司…）',
        h('input', { type: 'text', maxlength: '60', list: 'institution-list', value: f.institution, onInput: (e) => { f.institution = e.target.value; } }),
        h('datalist', { id: 'institution-list' }, institutions.map((i) => h('option', { value: i })))),
      h('label', { class: 'field' }, existing ? '目前價值' : '投入金額（目前價值）',
        h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: f.amount, onInput: (e) => { f.amount = e.target.value; } })),
      h('details', { class: 'more', open: !!(f.ticker || f.shares) },
        h('summary', {}, '自動更新價格（選填）'),
        h('div', { class: 'stack', style: 'margin-top:10px' },
          h('p', { class: 'muted', style: 'margin:0' }, '輸入代號和持有的股數／單位，每天開啟 App 時會自動更新價值。加密貨幣請填 CoinGecko 的 id（bitcoin、ethereum）；股票／ETF 請填 Twelve Data 代號（AAPL、VOO），並在設定中填入免費金鑰。'),
          h('label', { class: 'field' }, '代號', h('input', { type: 'text', maxlength: '30', autocapitalize: 'off', value: f.ticker, onInput: (e) => { f.ticker = e.target.value; } })),
          h('label', { class: 'field' }, '持有股數／單位', h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: f.shares, onInput: (e) => { f.shares = e.target.value; } })))),
      existing ? null : [
        acctBlock(f, { label: '從哪個帳戶支付？（記為支出時使用）' }),
        h('label', { class: 'field' }, '買入日期', h('input', { type: 'date', value: f.date, onChange: (e) => { f.date = e.target.value; } })),
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: f.record, onChange: (e) => { f.record = e.target.checked; } }),
          h('span', {}, '同時記為一筆支出（從我的帳戶支付）。如果在使用 App 之前就已持有，請取消勾選。')),
      ],
      h('button', { class: 'btn-primary btn-block', onClick: save }, existing ? '儲存變更' : '新增'),
      existing ? h('div', { class: 'row' },
        h('button', { class: 'grow', onClick: () => open('buy', existing.id) }, '＋ 加碼'),
        existing.amount > 0 ? h('button', { class: 'grow', onClick: () => open('sell', existing.id) }, '贖回') : null) : null,
      existing ? h('button', { class: 'btn-danger btn-block', onClick: remove }, '刪除') : null,
      h('button', { class: 'btn-block', onClick: close }, '取消'));
  }

  draw();
  return () => chart && chart.destroy();
}
