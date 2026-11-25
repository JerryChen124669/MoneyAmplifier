// Small helpers: DOM builder, number/date formatting, billing-period maths.

/** Tiny hyperscript: h('div', {class:'x', onClick: fn}, 'text', childEl). Text is always escaped. */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k === 'checked' || k === 'selected') el[k] = !!v;
    else if (/^on[A-Z]/.test(k) && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  if (value !== undefined) el.value = value; // after children so <select> works
  return el;
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

export const sum = (arr, pick = (x) => x) => arr.reduce((a, x) => a + pick(x), 0);

export function money(n, currency = 'TWD') {
  try {
    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${Number(n).toFixed(2)}`;
  }
}

// ---- dates (all dates are local 'YYYY-MM-DD' strings) ----
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
const daysIn = (y, m) => new Date(y, m, 0).getDate(); // m is 1-12

/** Which period ("YYYY-MM", named after the month it starts in) does this date fall in? */
export function periodKeyFor(dateStr, startDay = 1) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (d >= Math.min(startDay, daysIn(y, m))) return `${y}-${pad(m)}`;
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

/** Start (inclusive) and end (exclusive) date strings of a period. */
export function periodRange(key, startDay = 1) {
  const [y, m] = key.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return {
    start: ymd(new Date(y, m - 1, Math.min(startDay, daysIn(y, m)))),
    end: ymd(new Date(ny, nm - 1, Math.min(startDay, daysIn(ny, nm)))),
  };
}

export function shiftKey(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function periodLabel(key, startDay = 1) {
  const [y, m] = key.split('-').map(Number);
  if (startDay === 1) return new Date(y, m - 1, 1).toLocaleDateString('zh-TW', { month: 'long', year: 'numeric' });
  const { start, end } = periodRange(key, startDay);
  const last = new Date(end + 'T00:00:00');
  last.setDate(last.getDate() - 1);
  const fmt = (d) => d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
  return `${fmt(new Date(start + 'T00:00:00'))} – ${fmt(last)}`;
}

export function dayLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('zh-TW', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function download(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
