/* Historial de combos guardados */

import { $, state, newId, usd, pct, esc, fechaHora, toast, save, nowIso } from './core.js';
import { totalsOf, cargarCombo, descargarCsv, calcRow, dec } from './combo.js';

let onChanged = () => {};
let irACombo = () => {};

export function renderHistorial() {
  const cont = $('#histList');
  const lista = [...state.saved].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));

  $('#histEmpty').hidden = lista.length > 0;
  cont.hidden = lista.length === 0;

  let ganancia = 0, venta = 0;
  for (const s of lista) {
    const t = totalsOf(s.items, s.rate);
    ganancia += t.profit; venta += t.saleUsd;
  }
  $('#histCount').textContent = lista.length;
  $('#histProfit').textContent = usd(ganancia);
  $('#histSale').textContent = usd(venta);
  $('#histStats').hidden = lista.length === 0;

  cont.innerHTML = lista.map(s => {
    const t = totalsOf(s.items, s.rate);
    const activo = state.current.fromId === s.id;
    return `<article class="hist-card ${activo ? 'is-open' : ''}" data-id="${s.id}">
      <header class="hist-head">
        <div class="hist-title">
          <h3>${esc(s.name)}</h3>
          <p class="hist-meta">${fechaHora(s.savedAt)} · ${s.items.length} producto${s.items.length === 1 ? '' : 's'}${s.combos > 1 ? ` · ${s.combos} combos` : ''}</p>
        </div>
        <div class="hist-profit">
          <strong class="${t.profit > 0 ? 'pos' : t.profit < 0 ? 'neg' : ''}">${usd(t.profit)}</strong>
          <span>${t.margin === null ? '—' : pct(t.margin)}</span>
        </div>
      </header>
      <dl class="hist-nums">
        <div><dt>Costo</dt><dd>${usd(t.costUsd)}</dd></div>
        <div><dt>Venta</dt><dd>${usd(t.saleUsd)}</dd></div>
        <div><dt>Tasa</dt><dd>${s.rate} CUP</dd></div>
      </dl>
      <footer class="hist-actions">
        <button class="btn btn-sm" data-act="abrir">${activo ? 'Abierto' : 'Abrir'}</button>
        <button class="btn btn-sm btn-quiet" data-act="dup">Duplicar</button>
        <button class="btn btn-sm btn-quiet" data-act="csv">CSV</button>
        <button class="btn btn-sm btn-quiet danger" data-act="del">Borrar</button>
      </footer>
    </article>`;
  }).join('');
}

function csvGuardado(s) {
  const t = totalsOf(s.items, s.rate);
  const filas = [['Producto', 'Cantidad', 'Unidad', 'Costo c/u', 'Moneda costo', 'Costo CUP linea', 'Costo USD linea', 'Venta USD c/u', 'Venta USD linea', 'Ganancia USD']];
  for (const it of s.items) {
    const r = calcRow(it, s.rate);
    filas.push([it.name, dec(it.qty), it.unit, dec(it.cost), it.costCur, dec(r.costCup), dec(r.costUsd), dec(it.saleUsd), dec(r.saleUsd), dec(r.profit)]);
  }
  filas.push([]);
  filas.push(['TOTAL', '', '', '', '', dec(t.costCup), dec(t.costUsd), '', dec(t.saleUsd), dec(t.profit)]);
  filas.push(['Tasa USD', dec(s.rate)]);
  filas.push(['Guardado', fechaHora(s.savedAt)]);
  descargarCsv(filas, s.name);
}

export function initHistorial(notify, navegarACombo) {
  onChanged = notify || (() => {});
  irACombo = navegarACombo || (() => {});

  $('#histList').addEventListener('click', e => {
    const act = e.target.dataset.act;
    if (!act) return;
    const card = e.target.closest('.hist-card');
    const s = state.saved.find(x => x.id === card.dataset.id);
    if (!s) return;

    if (act === 'abrir') {
      const hayTrabajo = state.current.items.length && state.current.fromId !== s.id;
      const sinGuardar = hayTrabajo && !state.current.fromId;
      if (sinGuardar && !confirm('El combo que tienes abierto no está guardado y se va a reemplazar. ¿Seguir?')) return;
      cargarCombo(s);
      renderHistorial();
      irACombo();
      toast(`"${s.name}" abierto`);
    }

    if (act === 'dup') {
      const copia = {
        id: newId('c'),
        name: s.name + ' (copia)',
        savedAt: nowIso(),
        rate: s.rate,
        combos: s.combos,
        items: s.items.map(i => ({ ...i, id: newId() }))
      };
      state.saved.unshift(copia);
      save();
      renderHistorial();
      onChanged();
      toast('Combo duplicado');
    }

    if (act === 'csv') csvGuardado(s);

    if (act === 'del') {
      if (!confirm(`¿Borrar "${s.name}" del historial?`)) return;
      state.saved = state.saved.filter(x => x.id !== s.id);
      if (state.current.fromId === s.id) state.current.fromId = null;
      save();
      renderHistorial();
      onChanged();
      toast('Borrado del historial');
    }
  });
}
