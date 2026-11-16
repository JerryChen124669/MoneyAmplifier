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
export const PALETTE = ['#0f766e', '#f59e0b', '#6366f1', '#ef4444', '#06b6d4', '#84cc16', '#ec4899', '#8b5cf6', '#f97316', '#64748b', '#14b8a6', '#a16207'];

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
