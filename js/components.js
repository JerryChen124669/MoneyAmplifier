// Shared UI pieces used by several views.
import { h, money, periodKeyFor, periodLabel, shiftKey, today } from './util.js';
import { getState } from './store.js';

/** Which month/period the Home, History and Budget tabs are showing (kept while you switch tabs). */
export const ui = { period: null };
export function currentPeriod() {
  return periodKeyFor(today(), getState().settings.startDay);
}
export function activePeriod() {
  if (!ui.period) ui.period = currentPeriod();
  return ui.period;
}

export function monthNav(onChange) {
  const { startDay } = getState().settings;
  const go = (delta) => { ui.period = shiftKey(activePeriod(), delta); onChange(); };
  return h('div', { class: 'month-nav' },
    h('button', { 'aria-label': 'Previous period', onClick: () => go(-1) }, '‹'),
    h('strong', {}, periodLabel(activePeriod(), startDay)),
    h('button', { 'aria-label': 'Next period', onClick: () => go(1) }, '›'));
}

export function txRow(t) {
  const { currency } = getState().settings;
  const sign = t.type === 'income' ? '+' : '−';
  return h('a', { class: 'tx', href: `#/add/${t.id}` },
    h('div', { class: 'grow' },
      h('div', { class: 'name' }, t.category || 'Uncategorised'),
      t.note ? h('div', { class: 'muted' }, t.note) : null),
    h('div', { class: `amt ${t.type}` }, sign + money(t.amount, currency)));
}

export const empty = (text) => h('div', { class: 'empty' }, text);

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/** Colours for charts (works in light and dark). */
export const PALETTE = ['#ff7fa1', '#ffb86b', '#7bd3b0', '#8fb8ff', '#c4a1ff', '#ffd966', '#ff9a8b', '#6fd1e0', '#b6e07a', '#f4a6d7', '#a3a3d9', '#e0b38a'];

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
