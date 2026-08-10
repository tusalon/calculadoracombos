/* Arranque: navegación entre secciones y cableado general */

import { $, $$, state, num, qtyFmt, load, save, toast } from './core.js';
import { initCombo, renderCombo, renderTotals, guardarCombo, nuevoCombo, summaryText, copiar } from './combo.js';
import { initHistorial, renderHistorial } from './historial.js';
import { initRemesas, renderRemesas } from './remesas.js';
import { initTrading, renderTrading } from './trading.js';
import { initPlanner, renderPlanner } from './planner.js';

/* ---------- Navegación ---------- */

function irA(tab) {
  state.tab = tab;
  $$('.tab').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  $$('.view').forEach(v => { v.hidden = v.dataset.view !== tab; });
  $('#summary').hidden = tab !== 'combo';
  document.body.classList.toggle('no-summary', tab !== 'combo');
  if (tab === 'historial') renderHistorial();
  if (tab === 'remesas') renderRemesas();
  if (tab === 'trading') renderTrading();
  if (tab === 'planner') renderPlanner();
  scrollTo({ top: 0, behavior: 'instant' });
}

/* ---------- Cambios que afectan a más de una sección ---------- */

function refrescarTodo() {
  if (state.tab === 'historial') renderHistorial();
  if (state.tab === 'remesas') renderRemesas();
  if (state.tab === 'trading') renderTrading();
  actualizarInsignias();
}

function actualizarInsignias() {
  const h = $('#tabHistBadge');
  h.textContent = state.saved.length || '';
  h.hidden = !state.saved.length;

  const pend = state.remesas.filter(r => r.status === 'pendiente').length;
  const r = $('#tabRemBadge');
  r.textContent = pend || '';
  r.hidden = !pend;
}

/* ---------- Arranque ---------- */

load();

initCombo(actualizarInsignias);
initHistorial(refrescarTodo, () => irA('combo'));
initRemesas(refrescarTodo);
initTrading(refrescarTodo);
initPlanner();

$('#rate').value = qtyFmt(state.rate);
$('#combos').value = state.current.combos;
$('#comboName').textContent = state.current.name;

$('#rate').addEventListener('input', e => {
  state.rate = num(e.target.value);
  renderCombo();
  refrescarTodo();
});

$$('.tab').forEach(b => b.addEventListener('click', () => irA(b.dataset.tab)));

/* ---------- Menú ---------- */

const menu = $('#dlgMenu');
$('#btnMenu').addEventListener('click', () => menu.showModal());
$('#mNuevo').addEventListener('click', () => { menu.close(); setTimeout(nuevoCombo, 100); });
$('#mGuardar').addEventListener('click', () => { menu.close(); setTimeout(guardarCombo, 100); });
$('#mCopy').addEventListener('click', () => { menu.close(); copiar(summaryText(), 'Resumen copiado'); });
$('#mPrint').addEventListener('click', () => { menu.close(); setTimeout(() => print(), 120); });

$('#mBorrarTodo').addEventListener('click', () => {
  menu.close();
  setTimeout(() => {
    if (!confirm('Esto borra los productos, el historial de combos, las remesas, las compras de USD y el planificador de este dispositivo. ¿Seguro?')) return;
    state.current = { name: '', combos: 1, items: [], fromId: null };
    state.saved = [];
    state.remesas = [];
    state.trades = [];
    state.planner.items = [];
    $('#comboName').textContent = '';
    $('#combos').value = 1;
    save();
    renderCombo();
    renderPlanner();
    refrescarTodo();
    toast('Todo borrado');
  }, 100);
});

$('#btnClear').addEventListener('click', () => {
  if (state.current.items.length && !confirm('¿Vaciar los productos de este combo?')) return;
  state.current.items = [];
  state.current.fromId = null;
  renderCombo();
  toast('Combo vacío');
});

/* ---------- Resumen desplegable ---------- */

$('#summaryToggle').addEventListener('click', () => {
  const btn = $('#summaryToggle');
  const abierto = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!abierto));
  $('#summaryDetail').hidden = abierto;
});

/* ---------- Primer pintado ---------- */

renderCombo();
renderPlanner();
actualizarInsignias();
irA('combo');

/* ---------- Service worker ---------- */

if ('serviceWorker' in navigator) {
  const teniaControl = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Solo recarga cuando una versión nueva reemplaza a una anterior
    if (!teniaControl || recargando) return;
    recargando = true;
    location.reload();
  });
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* Expuesto para pruebas rápidas en consola */
import * as parser from './parser.js';
import * as remesasMod from './remesas.js';
import * as comboMod from './combo.js';
import * as tradingMod from './trading.js';
import * as plannerMod from './planner.js';
window.__calc = { state, ...parser, ...comboMod, ...remesasMod, ...tradingMod, ...plannerMod, num, irA };
