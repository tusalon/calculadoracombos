/* Ficha de costo: cada producto es un paquete (cantidad + precio) del que se usa una parte.
   Costo de lo usado = precio × usado / paquete, convirtiendo unidades (kg/g/lb/oz, l/ml). */

import { $, state, newId, num, usd, cup, pct, esc, qtyFmt, toast, save } from './core.js';
import { copiar } from './combo.js';

let tbody;

/* ---------- Cálculos ---------- */

// Peso (base g) y volumen (base ml) se convierten entre sí.
// Cualquier otra unidad ("huevo", "lata"...) solo es compatible consigo misma.
const MASA = { g: 1, gr: 1, grs: 1, gramo: 1, gramos: 1, kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000,
  lb: 453.592, lbs: 453.592, libra: 453.592, libras: 453.592, oz: 28.3495, onza: 28.3495, onzas: 28.3495 };
const VOL = { ml: 1, l: 1000, lt: 1000, lts: 1000, litro: 1000, litros: 1000 };

function factor(usada, paquete) {
  const u = (usada || paquete || '').trim().toLowerCase();
  const p = (paquete || '').trim().toLowerCase();
  if (u === p) return 1;
  if (MASA[u] && MASA[p]) return MASA[u] / MASA[p];
  if (VOL[u] && VOL[p]) return VOL[u] / VOL[p];
  return null;   // unidades que no se pueden comparar
}

function calcRow(it, tasa = state.ficha.rate) {
  const rate = tasa > 0 ? tasa : 0;
  const fct = factor(it.useUnit, it.packUnit);
  const fraccion = fct === null || !(it.packQty > 0) ? 0 : it.useQty * fct / it.packQty;
  const native = it.price * fraccion;           // en la moneda en que se paga
  const costUsd = it.costCur === 'USD' ? native : (rate ? native / rate : 0);
  const costCup = it.costCur === 'USD' ? native * rate : native;
  return { costUsd, costCup, native, incompatible: fct === null };
}

function totals() { return totalsDe(state.ficha); }

function totalsDe(f) {
  const t = { costUsd: 0, costCup: 0, gastoCup: 0, gastoUsd: 0 };
  for (const it of f.items) {
    const r = calcRow(it, f.rate);
    t.costUsd += r.costUsd; t.costCup += r.costCup;
    if (it.costCur === 'CUP') t.gastoCup += r.native; else t.gastoUsd += r.native;
  }
  t.porUnidad = t.costUsd / Math.max(1, f.yield);
  t.precio = t.porUnidad * (1 + f.marginPct / 100);
  return t;
}

/* ---------- Render ---------- */

function rowHTML(it) {
  return `<tr data-id="${it.id}">
    <td class="c-name"><input class="cell-input name" data-f="name" value="${esc(it.name)}" placeholder="Producto o insumo"></td>
    <td class="c-qty c-num" data-label="Cantidad del paquete"><input class="cell-input num" data-f="packQty" inputmode="decimal" value="${qtyFmt(it.packQty)}"></td>
    <td class="c-unit" data-label="Unidad del paquete"><input class="cell-input cell-unit" data-f="packUnit" list="units" value="${esc(it.packUnit)}"></td>
    <td class="c-cost c-num" data-label="Precio del paquete">
      <div class="cost-wrap">
        <button type="button" class="cur-btn ${it.costCur === 'USD' ? 'is-usd' : ''}" data-act="cur">${it.costCur}</button>
        <input class="cell-input num" data-f="price" inputmode="decimal" value="${it.price ? qtyFmt(it.price) : ''}" placeholder="0">
      </div>
    </td>
    <td class="c-useq c-num" data-label="Usé"><input class="cell-input num" data-f="useQty" inputmode="decimal" value="${qtyFmt(it.useQty)}"></td>
    <td class="c-useu c-unit" data-label="Unidad usada"><input class="cell-input cell-unit" data-f="useUnit" list="units" value="${esc(it.useUnit)}" placeholder="${esc(it.packUnit)}"></td>
    <td class="c-costusd c-num" data-label="Costo USD"><span class="calc" data-o="costUsd"></span></td>
    <td class="c-saleusd c-num" data-label="Costo CUP"><span class="calc muted" data-o="costCup"></span></td>
    <td class="c-profit c-num" data-label="% del total"><span class="calc muted" data-o="share"></span></td>
    <td class="c-del"><button class="del" data-act="del" aria-label="Eliminar">✕</button></td>
  </tr>`;
}

function paintRow(it, total) {
  const tr = tbody.querySelector(`tr[data-id="${it.id}"]`);
  if (!tr) return;
  const r = calcRow(it);
  tr.querySelector('[data-o="costUsd"]').textContent = usd(r.costUsd);
  tr.querySelector('[data-o="costCup"]').textContent = cup(r.costCup);
  tr.querySelector('[data-o="share"]').textContent = total > 0 ? pct(r.costUsd / total * 100) : '—';
  tr.classList.toggle('bad', r.incompatible);
  tr.title = r.incompatible ? 'La unidad usada no se puede comparar con la del paquete (usa g/kg/lb o ml/l, o la misma unidad)' : '';
}

function renderTotals() {
  const t = totals();
  const f = state.ficha;
  $('#fCostoTotal').textContent = usd(t.costUsd);
  $('#fCostoTotalN').textContent = `${cup(t.costCup)} a la tasa`;
  $('#fGastoCup').textContent = cup(t.gastoCup);
  $('#fGastoUsd').textContent = usd(t.gastoUsd);
  $('#fPorUnidad').textContent = usd(t.porUnidad);
  $('#fPorUnidadN').textContent = f.marginPct > 0
    ? `precio sugerido ${usd(t.precio)} (+${qtyFmt(f.marginPct)}%)`
    : `entre ${qtyFmt(f.yield)} unidad${f.yield === 1 ? '' : 'es'}`;
  state.ficha.items.forEach(it => paintRow(it, t.costUsd));
  save();
}

export function renderFicha() {
  const f = state.ficha;
  renderGuardadas();
  $('#fName').value = f.name;
  $('#fRate').value = qtyFmt(f.rate);
  $('#fYield').value = qtyFmt(f.yield);
  $('#fMargin').value = f.marginPct ? qtyFmt(f.marginPct) : '';
  tbody.innerHTML = f.items.map(rowHTML).join('');
  $('#fEmpty').hidden = f.items.length > 0;
  $('#fTbl').hidden = f.items.length === 0;
  renderTotals();
}

/* ---------- Fichas guardadas ---------- */

function renderGuardadas() {
  const L = [...state.fichas].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  $('#fSavedWrap').hidden = !L.length;
  $('#fSaved').innerHTML = L.map(x => {
    const t = totalsDe(x);
    return `<article class="hist-card ${state.ficha.fromId === x.id ? 'is-open' : ''}" data-id="${x.id}">
      <header class="hist-head">
        <div class="hist-title"><h3>${esc(x.name || 'Sin nombre')}</h3>
          <p class="hist-meta">${x.items.length} producto${x.items.length === 1 ? '' : 's'} · rinde ${qtyFmt(x.yield)}</p></div>
        <div class="hist-profit"><strong>${usd(t.porUnidad)}</strong><span>por unidad</span></div>
      </header>
      <footer class="hist-actions">
        <button class="btn btn-sm" data-act="abrir">Abrir</button>
        <button class="btn btn-sm btn-quiet danger" data-act="borrar">Borrar</button>
      </footer>
    </article>`;
  }).join('');
}

function guardarFicha() {
  const f = state.ficha;
  if (!f.name.trim()) { toast('Ponle nombre a la ficha'); $('#fName').focus(); return; }
  if (!f.items.length) { toast('Añade productos primero'); return; }
  const copia = { name: f.name.trim(), rate: f.rate, yield: f.yield, marginPct: f.marginPct,
    items: f.items.map(i => ({ ...i })), savedAt: new Date().toISOString() };
  const previa = f.fromId && state.fichas.find(x => x.id === f.fromId);
  if (previa) Object.assign(previa, copia);
  else { const id = newId('f'); state.fichas.push({ id, ...copia }); f.fromId = id; }
  save();
  renderGuardadas();
  toast(`"${copia.name}" guardada`);
}

function nuevaFicha() {
  if (state.ficha.items.length && !state.ficha.fromId && !confirm('La ficha en pantalla no está guardada y se va a vaciar. ¿Seguir?')) return;
  state.ficha = { name: '', rate: state.ficha.rate, yield: 1, marginPct: 0, fromId: null, items: [] };
  renderFicha();
}

/* ---------- Resumen para WhatsApp ---------- */

export function fichaSummary() {
  const f = state.ficha, t = totals();
  const L = [`*Ficha de costo${f.name.trim() ? ' — ' + f.name.trim() : ''}*`];
  L.push(`Rinde: ${qtyFmt(f.yield)} · Tasa: ${qtyFmt(f.rate)} CUP = 1 USD`, '');
  for (const it of f.items) {
    if (!it.name.trim()) continue;
    const r = calcRow(it);
    const monto = it.costCur === 'USD' ? usd(r.native) : cup(r.native);
    L.push(`• ${it.name} — ${qtyFmt(it.useQty)} ${it.useUnit || it.packUnit} (de ${qtyFmt(it.packQty)} ${it.packUnit}) — ${monto}`);
  }
  L.push('', `Costo en CUP: ${cup(t.gastoCup)}`, `Costo en USD: ${usd(t.gastoUsd)}`);
  L.push(`Costo total: ${usd(t.costUsd)} (${cup(t.costCup)})`);
  L.push(`Costo por unidad: ${usd(t.porUnidad)}`);
  if (f.marginPct > 0) L.push(`Precio sugerido (+${qtyFmt(f.marginPct)}%): ${usd(t.precio)}`);
  return L.join('\n');
}

/* ---------- Conexión con el DOM ---------- */

export function initFicha() {
  tbody = $('#fTbody');
  const f = () => state.ficha;
  const itemDe = el => f().items.find(i => i.id === el.closest('tr').dataset.id);
  const TEXTO = new Set(['name', 'packUnit', 'useUnit']);

  $('#fName').addEventListener('input', e => { f().name = e.target.value; save(); });
  $('#fRate').addEventListener('input', e => { f().rate = num(e.target.value); renderTotals(); });
  $('#fYield').addEventListener('input', e => { f().yield = Math.max(1, num(e.target.value) || 1); renderTotals(); });
  $('#fMargin').addEventListener('input', e => { f().marginPct = num(e.target.value); renderTotals(); });

  tbody.addEventListener('input', e => {
    const k = e.target.dataset.f;
    const it = k && itemDe(e.target);
    if (!it) return;
    it[k] = TEXTO.has(k) ? e.target.value : num(e.target.value);
    if (k === 'packUnit') e.target.closest('tr').querySelector('[data-f="useUnit"]').placeholder = e.target.value;
    renderTotals();
  });

  tbody.addEventListener('click', e => {
    const act = e.target.dataset.act;
    if (act === 'del') {
      f().items = f().items.filter(i => i.id !== e.target.closest('tr').dataset.id);
      renderFicha();
    }
    if (act === 'cur') {
      const it = itemDe(e.target);
      it.costCur = it.costCur === 'CUP' ? 'USD' : 'CUP';
      e.target.textContent = it.costCur;
      e.target.classList.toggle('is-usd', it.costCur === 'USD');
      renderTotals();
    }
  });

  $('#btnFAdd').addEventListener('click', () => {
    f().items.push({ id: newId(), name: '', packQty: 1, packUnit: 'u', price: 0, costCur: 'CUP', useQty: 1, useUnit: '' });
    renderFicha();
    tbody.querySelector('tr:last-child [data-f="name"]')?.focus();
  });
  $('#btnFSave').addEventListener('click', guardarFicha);
  $('#btnFNew').addEventListener('click', nuevaFicha);
  $('#fSaved').addEventListener('click', e => {
    const act = e.target.dataset.act;
    const x = act && state.fichas.find(y => y.id === e.target.closest('.hist-card').dataset.id);
    if (!x) return;
    if (act === 'abrir') {
      if (state.ficha.items.length && !state.ficha.fromId && !confirm('La ficha en pantalla no está guardada y se va a reemplazar. ¿Seguir?')) return;
      state.ficha = { name: x.name, rate: x.rate, yield: x.yield, marginPct: x.marginPct, fromId: x.id,
        items: x.items.map(i => ({ ...i, id: newId() })) };
      renderFicha();
      scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (act === 'borrar' && confirm(`¿Borrar la ficha "${x.name}"?`)) {
      state.fichas = state.fichas.filter(y => y.id !== x.id);
      if (state.ficha.fromId === x.id) state.ficha.fromId = null;
      save();
      renderGuardadas();
    }
  });
  $('#btnFClear').addEventListener('click', () => {
    if (f().items.length && !confirm('¿Vaciar la ficha de costo?')) return;
    f().items = [];
    renderFicha();
    toast('Ficha vacía');
  });
  $('#btnFCopy').addEventListener('click', () => {
    if (!f().items.some(i => i.name.trim())) { toast('Añade productos primero'); return; }
    copiar(fichaSummary(), 'Ficha copiada');
  });
}
