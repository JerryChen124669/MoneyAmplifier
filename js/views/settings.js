// Settings: currency, billing-period start day, categories, backup / restore.
import { h, download, today } from '../util.js';
import { getState, update, replaceAll, exportJSON, exportCSV, exportInvestmentsCSV, defaults, INVEST_CATEGORY, INVEST_OUT_CATEGORY } from '../store.js';
import { toast } from '../components.js';

export const title = 'Settings';
const CURRENCIES = ['TWD', 'USD', 'EUR', 'JPY', 'GBP', 'CNY', 'HKD', 'SGD', 'KRW', 'AUD', 'CAD', 'THB', 'MYR'];

export function render(root) {
  const s = getState();

  const categoryCard = (type, label) => {
    const input = h('input', { type: 'text', maxlength: '40', placeholder: 'New category, e.g. 🐶 Pets', style: 'margin:0' });
    const add = () => {
      const name = input.value.trim();
      if (!name) return;
      if (s.categories[type].includes(name)) return toast('Already exists');
      update((st) => st.categories[type].push(name));
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    return h('div', { class: 'card' }, h('h2', {}, label),
      s.categories[type].map((c) => h('div', { class: 'row', style: 'padding:6px 0;border-bottom:1px solid var(--line)' },
        h('div', { class: 'grow' }, c),
        // the Investment category is what links purchases to the Invest page, so it stays fixed
        (c === INVEST_CATEGORY && type === 'expense') || (c === INVEST_OUT_CATEGORY && type === 'income')
          ? h('span', { class: 'muted' }, '🔒 linked to Invest page')
          : [h('button', { 'aria-label': `Rename ${c}`, onClick: () => rename(type, c) }, 'Rename'),
            h('button', { class: 'btn-danger', 'aria-label': `Delete ${c}`, onClick: () => removeCat(type, c) }, '×')])),
      h('div', { class: 'row', style: 'margin-top:10px' }, input, h('button', { onClick: add }, 'Add')));
  };

  function rename(type, oldName) {
    const name = (prompt('New name:', oldName) || '').trim();
    if (!name || name === oldName) return;
    if (s.categories[type].includes(name)) return toast('Already exists');
    update((st) => {
      st.categories[type] = st.categories[type].map((c) => (c === oldName ? name : c));
      st.transactions.forEach((t) => { if (t.type === type && t.category === oldName) t.category = name; });
    });
  }
  function removeCat(type, name) {
    if (!confirm(`Remove "${name}"? Past entries keep their label.`)) return;
    update((st) => { st.categories[type] = st.categories[type].filter((c) => c !== name); });
  }

  function importFile(file) {
    if (!file) return;
    file.text().then((text) => {
      if (!confirm('Replace ALL current data with this backup?')) return;
      try { replaceAll(JSON.parse(text)); toast('Backup restored'); } catch (e) { alert('Could not read that file: ' + e.message); }
    });
  }

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onChange: (e) => importFile(e.target.files[0]) });

  root.append(
    h('div', { class: 'card stack' }, h('h2', {}, 'General'),
      h('label', { class: 'field' }, 'Currency',
        h('select', { value: s.settings.currency, onChange: (e) => update((st) => { st.settings.currency = e.target.value; }) },
          CURRENCIES.map((c) => h('option', { value: c }, c)))),
      h('label', { class: 'field' }, 'Month starts on day (1 = calendar month, e.g. 25 if payday is the 25th)',
        h('input', {
          type: 'number', min: '1', max: '31', value: s.settings.startDay,
          onChange: (e) => { const v = Math.min(31, Math.max(1, parseInt(e.target.value) || 1)); update((st) => { st.settings.startDay = v; }); },
        }))),
    h('div', { class: 'card stack' }, h('h2', {}, 'Investment prices'),
      h('p', { class: 'muted', style: 'margin:0' }, 'Holdings with a ticker and a number of shares are re-priced once a day when you open the app. Crypto needs nothing (CoinGecko). Stocks and ETFs need a free key from twelvedata.com. The key stays on this device and is left out of backups. Only the ticker is sent, never your amounts.'),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: s.settings.autoPrices, onChange: (e) => update((st) => { st.settings.autoPrices = e.target.checked; }, { silent: true }) }),
        h('span', {}, 'Update prices automatically once a day')),
      h('label', { class: 'field' }, 'Twelve Data key (for stocks / ETFs)',
        h('input', {
          type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '80', value: s.settings.twelveKey,
          onChange: (e) => {
            const v = e.target.value.trim();
            if (!/^[\w-]{0,80}$/.test(v)) return toast('That does not look like a key');
            update((st) => { st.settings.twelveKey = v; }, { silent: true }); toast('Saved! ✨');
          },
        }))),
    categoryCard('expense', 'Expense categories'),
    categoryCard('income', 'Income categories'),
    h('div', { class: 'card stack' }, h('h2', {}, 'Your data'),
      h('p', { class: 'muted', style: 'margin:0' }, 'Data is stored only in this browser on this device. Export a backup regularly, especially before clearing browser data.'),
      h('button', { class: 'btn-block', onClick: () => download(`moneyamplifier-backup-${today()}.json`, exportJSON()) }, 'Export backup (JSON)'),
      h('button', { class: 'btn-block', onClick: () => download(`moneyamplifier-${today()}.csv`, exportCSV(), 'text/csv') }, 'Export transactions (CSV)'),
      h('button', { class: 'btn-block', onClick: () => download(`moneyamplifier-investments-${today()}.csv`, exportInvestmentsCSV(), 'text/csv') }, 'Export investments (CSV)'),
      h('button', { class: 'btn-block', onClick: () => fileInput.click() }, 'Restore from backup…'),
      fileInput,
      h('button', {
        class: 'btn-danger btn-block',
        onClick: () => { if (confirm('Erase ALL data on this device? This cannot be undone.') && confirm('Really erase everything?')) { replaceAll(defaults()); toast('All data erased'); } },
      }, 'Erase all data')),
    h('p', { class: 'muted', style: 'text-align:center' }, 'MoneyAmplifier v0.1'));
}
