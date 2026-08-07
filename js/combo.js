/* Calculadora del combo: tabla, totales, importar, exportar y guardar */

import {
  $, state, newId, num, usd, cup, qtyFmt, pct, esc, deacc, unitFmt,
  toast, save, nowIso
} from './core.js';
import { UNITS, parseList } from './parser.js';

/* ============================================================
   Cálculos
   ============================================================ */

// El costo puede estar declarado en CUP o en USD; se convierte con la tasa.
export function calcRow(it, rate = state.rate) {
  const r = rate > 0 ? rate : 0;
  const unitUsd = it.costCur === 'USD' ? it.cost : (r ? it.cost / r : 0);
  const unitCup = it.costCur === 'USD' ? it.cost * r : it.cost;
  const costUsd = it.qty * unitUsd;
  const costCup = it.qty * unitCup;
  const saleUsd = it.qty * it.saleUsd;
  return { costCup, costUsd, saleUsd, profit: saleUsd - costUsd };
}

export function totalsOf(items, rate) {
  const t = { costCup: 0, costUsd: 0, saleUsd: 0, profit: 0 };
  for (const it of items) {
    const r = calcRow(it, rate);
    t.costCup += r.costCup; t.costUsd += r.costUsd;
    t.saleUsd += r.saleUsd; t.profit += r.profit;
  }
  t.margin = t.saleUsd > 0 ? (t.profit / t.saleUsd) * 100 : null;
  return t;
}

export const totals = () => totalsOf(state.current.items, state.rate);

const isMissing = it => !(it.cost > 0) || !(it.saleUsd > 0);

export const nuevoItem = (o = {}) => ({
  id: newId(), name: '', qty: 1, unit: 'u',
  cost: 0, costCur: 'CUP', saleUsd: 0, ok: false, ...o
});

/* ============================================================
   Render de la tabla
   ============================================================ */

let tbody, onChanged = () => {};

function rowHTML(it) {
  const cls = [it.ok ? 'done' : '', isMissing(it) ? 'missing' : ''].filter(Boolean).join(' ');
  return `<tr data-id="${it.id}" class="${cls}">
    <td class="c-check"><input type="checkbox" data-f="ok" ${it.ok ? 'checked' : ''} aria-label="Verificado"></td>
    <td class="c-name"><input class="cell-input name" data-f="name" value="${esc(it.name)}" placeholder="Producto"></td>
    <td class="c-qty c-num" data-label="Cantidad"><input class="cell-input num" data-f="qty" inputmode="decimal" value="${qtyFmt(it.qty)}"></td>
    <td class="c-unit" data-label="Unidad"><input class="cell-input cell-unit" data-f="unit" list="units" value="${esc(it.unit)}"></td>
    <td class="c-cost c-num" data-label="Costo c/u">
      <div class="cost-wrap">
        <button type="button" class="cur-btn ${it.costCur === 'USD' ? 'is-usd' : ''}" data-act="cur"
                title="Cambiar moneda del costo">${it.costCur}</button>
        <input class="cell-input num" data-f="cost" inputmode="decimal" value="${it.cost ? qtyFmt(it.cost) : ''}" placeholder="0">
      </div>
    </td>
    <td class="c-costusd c-num" data-label="Costo USD"><span class="calc muted" data-o="costUsd"></span></td>
    <td class="c-sale c-num" data-label="Venta USD c/u"><input class="cell-input num" data-f="saleUsd" inputmode="decimal" value="${it.saleUsd ? qtyFmt(it.saleUsd) : ''}" placeholder="0"></td>
    <td class="c-saleusd c-num" data-label="Venta USD"><span class="calc" data-o="saleUsd"></span></td>
    <td class="c-profit c-num" data-label="Ganancia"><span class="calc" data-o="profit"></span></td>
    <td class="c-del"><button class="del" data-act="del" aria-label="Eliminar">✕</button></td>
  </tr>`;
}

export function renderCombo() {
  const items = state.current.items;
  const onlyPending = $('#onlyPending').checked;
  const list = onlyPending ? items.filter(i => !i.ok || isMissing(i)) : items;
  tbody.innerHTML = list.map(rowHTML).join('');
  $('#empty').hidden = items.length > 0;
  $('#tbl').hidden = items.length === 0;
  for (const it of list) paintRow(it);
  renderTotals();
}

function paintRow(it) {
  const tr = tbody.querySelector(`tr[data-id="${it.id}"]`);
  if (!tr) return;
  const r = calcRow(it);
  const set = (k, txt, cls) => {
    const el = tr.querySelector(`[data-o="${k}"]`);
    if (el) { el.textContent = txt; el.className = 'calc ' + (cls || ''); }
  };
  set('costUsd', usd(r.costUsd), 'muted');
  set('saleUsd', usd(r.saleUsd), '');
  set('profit', usd(r.profit), r.profit > 0 ? 'pos' : r.profit < 0 ? 'neg' : 'muted');
  tr.classList.toggle('done', !!it.ok);
  tr.classList.toggle('missing', isMissing(it));
}

export function renderTotals() {
  const t = totals();
  const items = state.current.items;

  const p = $('#sProfit');
  p.textContent = usd(t.profit);
  p.className = 'sum-value ' + (t.profit > 0 ? 'pos' : t.profit < 0 ? 'neg' : '');
  $('#sMargin').textContent = t.margin === null ? '—' : pct(t.margin);
  $('#sCostCup').textContent = cup(t.costCup);
  $('#sCostUsd').textContent = usd(t.costUsd);
  $('#sSaleUsd').textContent = usd(t.saleUsd);
  $('#sProfitCup').textContent = cup(t.profit * state.rate);

  const n = state.current.combos;
  const pc = $('#perCombo');
  pc.hidden = !(n > 1 && items.length);
  if (!pc.hidden) {
    $('#pcCount').textContent = `(de ${n})`;
    $('#pcCost').textContent = usd(t.costUsd / n);
    $('#pcSale').textContent = usd(t.saleUsd / n);
    $('#pcProfit').textContent = usd(t.profit / n);
  }

  const total = items.length;
  const done = items.filter(i => i.ok).length;
  const miss = items.filter(isMissing).length;
  const st = $('#verifyStatus');
  if (!total) { st.textContent = 'Sin productos'; st.className = 'verify-status'; }
  else if (done === total && !miss) { st.textContent = `✓ ${total} productos verificados`; st.className = 'verify-status ok'; }
  else {
    st.textContent = `${done}/${total} verificados` + (miss ? ` · ${miss} sin precio` : '');
    st.className = 'verify-status';
  }
  save();
  onChanged();
}

/* ============================================================
   Guardar en el historial
   ============================================================ */

export function guardarCombo() {
  const items = state.current.items;
  if (!items.length) { toast('No hay productos que guardar'); return; }

  const nombre = state.current.name.trim();
  if (!nombre) {
    toast('Ponle nombre al combo primero');
    const el = $('#comboName');
    el.focus();
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  const copia = items.map(i => ({ ...i }));
  const anterior = state.current.fromId
    ? state.saved.find(s => s.id === state.current.fromId)
    : null;

  if (anterior) {
    anterior.name = nombre;
    anterior.savedAt = nowIso();
    anterior.rate = state.rate;
    anterior.combos = state.current.combos;
    anterior.items = copia;
    toast(`"${nombre}" actualizado`);
  } else {
    const id = newId('c');
    state.saved.unshift({
      id, name: nombre, savedAt: nowIso(),
      rate: state.rate, combos: state.current.combos, items: copia
    });
    state.current.fromId = id;
    toast(`"${nombre}" guardado en el historial`);
  }
  save();
  onChanged();
}

export function nuevoCombo() {
  state.current = { name: '', combos: 1, items: [], fromId: null };
  $('#comboName').textContent = '';
  $('#combos').value = 1;
  $('#onlyPending').checked = false;
  renderCombo();
  toast('Combo nuevo en blanco');
}

// Carga un combo guardado en la mesa de trabajo
export function cargarCombo(saved) {
  state.current = {
    name: saved.name,
    combos: saved.combos,
    items: saved.items.map(i => ({ ...i, id: newId() })),
    fromId: saved.id
  };
  state.rate = saved.rate;
  $('#rate').value = qtyFmt(state.rate);
  $('#comboName').textContent = saved.name;
  $('#combos').value = saved.combos;
  $('#onlyPending').checked = false;
  renderCombo();
}

/* ============================================================
   Texto y CSV
   ============================================================ */

export function summaryText() {
  const t = totals();
  const L = [];
  L.push('*' + (state.current.name || 'Combo') + '*');
  L.push(`Tasa: ${qtyFmt(state.rate)} CUP = 1 USD`);
  if (state.current.combos > 1) L.push(`Combos: ${state.current.combos}`);
  L.push('');
  for (const it of state.current.items) {
    const r = calcRow(it);
    L.push(`• ${it.name} — ${qtyFmt(it.qty)} ${unitFmt(it.unit, it.qty)} — venta ${usd(r.saleUsd)}`);
  }
  L.push('');
  L.push(`Costo: ${cup(t.costCup)} (${usd(t.costUsd)})`);
  L.push(`Venta: ${usd(t.saleUsd)}`);
  L.push(`Ganancia: ${usd(t.profit)}${t.margin === null ? '' : ` (${pct(t.margin)})`}`);
  if (state.current.combos > 1) {
    L.push(`Por combo: venta ${usd(t.saleUsd / state.current.combos)} · ganancia ${usd(t.profit / state.current.combos)}`);
  }
  return L.join('\n');
}

export async function copiar(txt, msg = 'Copiado') {
  try { await navigator.clipboard.writeText(txt); toast(msg); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove(); toast(msg);
  }
}

export function descargarCsv(filas, nombre) {
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const csv = '﻿' + filas.map(r => r.map(q).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = (nombre || 'datos').replace(/[^\w\sáéíóúñ-]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV descargado');
}

export const dec = n => String(Math.round(n * 100) / 100).replace('.', ',');

function csvCombo() {
  const t = totals();
  const filas = [['Producto', 'Cantidad', 'Unidad', 'Costo c/u', 'Moneda costo', 'Costo CUP linea', 'Costo USD linea', 'Venta USD c/u', 'Venta USD linea', 'Ganancia USD']];
  for (const it of state.current.items) {
    const r = calcRow(it);
    filas.push([it.name, dec(it.qty), it.unit, dec(it.cost), it.costCur, dec(r.costCup), dec(r.costUsd), dec(it.saleUsd), dec(r.saleUsd), dec(r.profit)]);
  }
  filas.push([]);
  filas.push(['TOTAL', '', '', '', '', dec(t.costCup), dec(t.costUsd), '', dec(t.saleUsd), dec(t.profit)]);
  filas.push(['Tasa USD', dec(state.rate)]);
  descargarCsv(filas, state.current.name || 'combo');
}

/* ============================================================
   Conexión con el DOM
   ============================================================ */

export function initCombo(notify) {
  onChanged = notify || (() => {});
  tbody = $('#tbody');

  // Lista de unidades sugeridas
  const dl = document.createElement('datalist');
  dl.id = 'units';
  dl.innerHTML = [...new Set(UNITS.map(u => u[1]))].map(u => `<option value="${u}">`).join('');
  document.body.appendChild(dl);

  const itemDe = el => state.current.items.find(i => i.id === el.closest('tr').dataset.id);

  tbody.addEventListener('input', e => {
    const f = e.target.dataset.f;
    if (!f) return;
    const it = itemDe(e.target);
    if (!it) return;
    if (f === 'name' || f === 'unit') it[f] = e.target.value;
    else if (f === 'ok') it.ok = e.target.checked;
    else it[f] = num(e.target.value);
    paintRow(it);
    renderTotals();
  });

  tbody.addEventListener('change', e => {
    if (e.target.dataset.f !== 'ok') return;
    const it = itemDe(e.target);
    if (!it) return;
    it.ok = e.target.checked;
    paintRow(it);
    renderTotals();
    if ($('#onlyPending').checked) setTimeout(renderCombo, 220);
  });

  tbody.addEventListener('click', e => {
    const act = e.target.dataset.act;
    if (!act) return;
    const tr = e.target.closest('tr');

    if (act === 'del') {
      state.current.items = state.current.items.filter(i => i.id !== tr.dataset.id);
      renderCombo();
      toast('Producto eliminado');
    }
    if (act === 'cur') {
      const it = itemDe(e.target);
      if (!it) return;
      it.costCur = it.costCur === 'CUP' ? 'USD' : 'CUP';
      e.target.textContent = it.costCur;
      e.target.classList.toggle('is-usd', it.costCur === 'USD');
      const td = e.target.closest('td');
      td.dataset.label = 'Costo c/u';
      paintRow(it);
      renderTotals();
    }
  });

  // Enter salta a la misma columna de la fila siguiente
  tbody.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const f = e.target.dataset.f;
    if (!f) return;
    e.preventDefault();
    const rows = [...tbody.querySelectorAll('tr')];
    const i = rows.indexOf(e.target.closest('tr'));
    const next = rows[i + 1]?.querySelector(`[data-f="${f}"]`);
    if (next) { next.focus(); next.select?.(); }
  });

  $('#combos').addEventListener('input', e => {
    state.current.combos = Math.max(1, Math.round(num(e.target.value)) || 1);
    renderTotals();
  });

  document.querySelectorAll('.step').forEach(b => b.addEventListener('click', () => {
    state.current.combos = Math.max(1, state.current.combos + Number(b.dataset.step));
    $('#combos').value = state.current.combos;
    renderTotals();
  }));

  $('#onlyPending').addEventListener('change', renderCombo);

  $('#comboName').addEventListener('input', e => {
    state.current.name = e.target.textContent.trim();
    save();
  });

  $('#btnAdd').addEventListener('click', () => {
    state.current.items.push(nuevoItem());
    $('#onlyPending').checked = false;
    renderCombo();
    const last = tbody.querySelector('tr:last-child [data-f="name"]');
    last?.focus();
    last?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  $('#btnSave').addEventListener('click', guardarCombo);
  $('#btnCopy').addEventListener('click', () => copiar(summaryText(), 'Resumen copiado'));
  $('#btnCsv').addEventListener('click', csvCombo);

  initImport();

  return { csvCombo };
}

/* ============================================================
   Importar lista de WhatsApp
   ============================================================ */

let preview = [];

export function abrirImport() {
  $('#importStep1').hidden = false;
  $('#importStep2').hidden = true;
  $('#dlgImport').showModal();
  setTimeout(() => $('#rawList').focus(), 60);
}

function initImport() {
  const dlg = $('#dlgImport');

  $('#btnImport').addEventListener('click', abrirImport);
  $('#btnImport2').addEventListener('click', abrirImport);

  $('#btnPasteClip').addEventListener('click', async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) { $('#rawList').value = txt; toast('Lista pegada'); }
      else toast('El portapapeles está vacío');
    } catch {
      toast('Pega manualmente con Ctrl+V');
      $('#rawList').focus();
    }
  });

  $('#btnParse').addEventListener('click', () => {
    preview = parseList($('#rawList').value);
    if (!preview.length) { toast('No se encontró ningún producto'); return; }
    $('#preview').innerHTML = preview.map((p, i) => `
      <div class="pv-row ${p.include ? '' : 'off'}" data-i="${i}">
        <input type="checkbox" data-p="include" ${p.include ? 'checked' : ''} aria-label="Incluir">
        <input type="text" class="pv-qty" data-p="qty" inputmode="decimal" value="${qtyFmt(p.qty)}">
        <input type="text" data-p="unit" list="units" value="${esc(p.unit)}">
        <input type="text" data-p="name" value="${esc(p.name)}">
        <div class="pv-raw">${esc(p.raw)}</div>
      </div>`).join('');
    $('#importStep1').hidden = true;
    $('#importStep2').hidden = false;
    actualizarConfirmar();
  });

  $('#preview').addEventListener('input', e => {
    const k = e.target.dataset.p;
    if (!k) return;
    const row = e.target.closest('.pv-row');
    const p = preview[+row.dataset.i];
    if (k === 'include') { p.include = e.target.checked; row.classList.toggle('off', !p.include); actualizarConfirmar(); }
    else if (k === 'qty') p.qty = num(e.target.value);
    else p[k] = e.target.value;
  });

  $('#btnBack').addEventListener('click', () => {
    $('#importStep1').hidden = false;
    $('#importStep2').hidden = true;
  });

  $('#btnConfirm').addEventListener('click', () => {
    const chosen = preview.filter(p => p.include && p.name.trim());
    let merged = 0;
    for (const p of chosen) {
      const key = deacc(p.name).toLowerCase().trim();
      const dup = state.current.items.find(i => deacc(i.name).toLowerCase().trim() === key && i.unit === p.unit);
      if (dup) { dup.qty += p.qty; dup.ok = false; merged++; }
      else state.current.items.push(nuevoItem({ name: p.name.trim(), qty: p.qty, unit: p.unit }));
    }
    dlg.close();
    $('#rawList').value = '';
    renderCombo();
    toast(`${chosen.length - merged} agregados` + (merged ? ` · ${merged} sumados a existentes` : ''));
  });
}

function actualizarConfirmar() {
  const n = preview.filter(p => p.include).length;
  $('#btnConfirm').textContent = n ? `Agregar ${n} producto${n > 1 ? 's' : ''}` : 'Agregar';
  $('#btnConfirm').disabled = !n;
}
