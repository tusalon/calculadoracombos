/* Calculadora de Combos — PWA sin dependencias */
(() => {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const STORE = 'calccombos.v1';

/* ============================================================
   Estado
   ============================================================ */
const state = {
  name: '',
  rate: 440,
  combos: 1,
  items: []   // {id, name, qty, unit, costCup, saleUsd, ok}
};
let seq = 1;
const newId = () => 'i' + (seq++);

/* ============================================================
   Números
   ============================================================ */

// Acepta "1200", "1.5", "1,5", "1.234,56", "1/2", "" -> número o 0
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v ?? '').trim();
  if (!s) return 0;
  s = s.replace(/[^\d.,/-]/g, '');
  const frac = s.match(/^(-?\d+)?\s*(\d+)\/(\d+)$/);
  if (frac) {
    const base = frac[1] ? parseFloat(frac[1]) : 0;
    const d = parseFloat(frac[3]);
    return d ? base + parseFloat(frac[2]) / d : base;
  }
  const hasDot = s.includes('.'), hasCom = s.includes(',');
  if (hasDot && hasCom) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (hasCom) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

const usd = n => '$' + (Math.round(n * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cup = n => Math.round(n).toLocaleString('es-ES') + ' CUP';
const qtyFmt = n => (Math.round(n * 1000) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 3, useGrouping: false });
const pct = n => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

// "2 lata" -> "2 latas" (las abreviaturas no se pluralizan)
const ABBREV_UNITS = new Set(['lb', 'kg', 'g', 'u']);
function unitFmt(unit, qty) {
  const u = String(unit || '').trim();
  if (!u || qty === 1 || ABBREV_UNITS.has(u) || /s$/i.test(u)) return u;
  return /ón$/i.test(u) ? u.replace(/ón$/i, 'ones') : u + 's';
}

/* ============================================================
   Parser de listas de WhatsApp
   ============================================================ */

const deacc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const UNITS = [
  [/^(lbs?|libras?)$/,                    'lb'],
  [/^(kgs?|kilos?|kilogramos?)$/,         'kg'],
  [/^(gr?|grs|gramos?)$/,                 'g'],
  [/^pomos?$/,                            'pomo'],
  [/^(pqtes?|pqts?|paqs?|pq|paquetes?)$/, 'paquete'],
  [/^(latas?|laticas?|latitas?)$/,        'lata'],
  [/^cajas?$/,                            'caja'],
  [/^(bolsas?|bolsitas?)$/,               'bolsa'],
  [/^(lts?|litros?)$/,                    'litro'],
  [/^(botellas?|botellitas?)$/,           'botella'],
  [/^(cartones?|carton)$/,                'cartón'],
  [/^sacos?$/,                            'saco'],
  [/^bandejas?$/,                         'bandeja'],
  [/^barras?$/,                           'barra'],
  [/^frascos?$/,                          'frasco'],
  [/^sobres?$/,                           'sobre'],
  [/^(rollos?)$/,                         'rollo'],
  [/^(uds?|und|un|u|unidad|unidades)$/,   'u']
];

const WORD_NUM = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  docena: 12, media: 0.5, medio: 0.5
};

// Abreviaturas típicas dentro del nombre
const ABBR = { d: 'de', f: 'frijol', fj: 'frijol', az: 'azúcar' };

const NOISE = /^(hola|buenas?|buenos|gracias|ok|dale|saludos|combo|lista|pedido|total|precio|nota|mensaje|hoy|aqui|aquí)\b/;

function unitOf(tok) {
  for (const [re, label] of UNITS) if (re.test(tok)) return label;
  return null;
}

function cleanLine(line) {
  return line
    // Prefijo de exportación de WhatsApp: [12/3/25, 10:04] Juan:
    .replace(/^\s*\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(:\d{2})?\s*([ap]\.?\s?m\.?)?\]?\s*-?\s*[^:]{0,40}:\s*/i, '')
    .replace(/^[\s>*•·▪◦\-–—+#]+/, '')
    .replace(/^\d+[).]\s+/, '')                // numeración "1) arroz"
    .replace(/[‎‏]/g, '')
    .trim();
}

function titleCase(s) {
  return s.replace(/^\s*([a-záéíóúñü])/i, (m, c) => c.toUpperCase());
}

function expandName(words) {
  return words
    .map(w => ABBR[deacc(w).toLowerCase()] ?? w)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Devuelve {qty, unit, name, raw, include} o null
function parseLine(rawLine) {
  const raw = cleanLine(rawLine);
  if (!raw || !/[a-záéíóúñü]/i.test(raw)) return null;

  let toks = raw.split(/\s+/);
  let qty = null, unit = null;

  // "10lbs" pegado
  const glued = deacc(toks[0]).toLowerCase().match(/^(\d+(?:[.,]\d+)?)([a-z]+)$/);
  if (glued) toks.splice(0, 1, glued[1], glued[2]);

  const readQty = i => {
    const r = readQtyBase(i);
    if (!r) return null;
    // "media docena", "2 docenas" -> x12
    if (/^docenas?$/.test(deacc(toks[i + r.used] ?? '').toLowerCase())) {
      return { v: r.v * 12, used: r.used + 1 };
    }
    return r;
  };

  const readQtyBase = i => {
    const t = deacc(toks[i] ?? '').toLowerCase();
    if (/^\d+\/\d+$/.test(t)) return { v: num(t), used: 1 };
    if (/^\d+(?:[.,]\d+)?$/.test(t)) {
      const next = deacc(toks[i + 1] ?? '').toLowerCase();
      if (/^\d+\/\d+$/.test(next)) return { v: num(t) + num(next), used: 2 };
      return { v: num(t), used: 1 };
    }
    if (t in WORD_NUM) return { v: WORD_NUM[t], used: 1 };
    return null;
  };

  // Cantidad al inicio
  const head = readQty(0);
  if (head) {
    qty = head.v;
    toks = toks.slice(head.used);
  } else {
    // Cantidad al final: "arroz 10 lbs"
    const last = toks.length - 1;
    const maybeUnit = unitOf(deacc(toks[last] ?? '').toLowerCase());
    const qi = maybeUnit ? last - 1 : last;
    const tail = qi > 0 ? readQty(qi) : null;
    if (tail && qi + tail.used >= toks.length - (maybeUnit ? 1 : 0)) {
      qty = tail.v;
      unit = maybeUnit;
      toks = toks.slice(0, qi);
    }
  }

  // Unidad después de la cantidad
  if (!unit && toks.length) {
    const u = unitOf(deacc(toks[0]).toLowerCase());
    if (u && toks.length > 1) { unit = u; toks = toks.slice(1); }
    else if (u && toks.length === 1 && qty !== null) { unit = u; toks = []; }
  }

  // Conector "de/d/del" tras la unidad
  if (toks.length > 1 && /^(de|del|d)$/.test(deacc(toks[0]).toLowerCase())) toks = toks.slice(1);

  const name = titleCase(expandName(toks));
  if (!name) return null;

  const words = raw.split(/\s+/).length;
  const include = !(qty === null && (words > 7 || NOISE.test(deacc(raw).toLowerCase()) || /[:?]$/.test(raw)));

  return { qty: qty ?? 1, unit: unit || 'u', name, raw, include };
}

function parseList(text) {
  return text.split(/\r?\n/).map(parseLine).filter(Boolean);
}

/* ============================================================
   Cálculos
   ============================================================ */

function calcRow(it) {
  const rate = state.rate > 0 ? state.rate : 0;
  const costCup = it.qty * it.costCup;
  const costUsd = rate ? costCup / rate : 0;
  const saleUsd = it.qty * it.saleUsd;
  return { costCup, costUsd, saleUsd, profit: saleUsd - costUsd };
}

function totals() {
  const t = { costCup: 0, costUsd: 0, saleUsd: 0, profit: 0 };
  for (const it of state.items) {
    const r = calcRow(it);
    t.costCup += r.costCup; t.costUsd += r.costUsd;
    t.saleUsd += r.saleUsd; t.profit += r.profit;
  }
  t.margin = t.saleUsd > 0 ? (t.profit / t.saleUsd) * 100 : null;
  return t;
}

const isMissing = it => !(it.costCup > 0) || !(it.saleUsd > 0);

/* ============================================================
   Render
   ============================================================ */

const tbody = $('#tbody');

function rowHTML(it) {
  const cls = [it.ok ? 'done' : '', isMissing(it) ? 'missing' : ''].filter(Boolean).join(' ');
  return `<tr data-id="${it.id}" class="${cls}">
    <td class="c-check"><input type="checkbox" data-f="ok" ${it.ok ? 'checked' : ''} aria-label="Verificado"></td>
    <td class="c-name"><input class="cell-input name" data-f="name" value="${esc(it.name)}" placeholder="Producto"></td>
    <td class="c-num" data-label="Cantidad"><input class="cell-input num" data-f="qty" inputmode="decimal" value="${qtyFmt(it.qty)}"></td>
    <td class="c-unit" data-label="Unidad"><input class="cell-input cell-unit" data-f="unit" list="units" value="${esc(it.unit)}"></td>
    <td class="c-num" data-label="Costo CUP c/u"><input class="cell-input num" data-f="costCup" inputmode="decimal" value="${it.costCup ? qtyFmt(it.costCup) : ''}" placeholder="0"></td>
    <td class="c-num" data-label="Costo USD"><span class="calc muted" data-o="costUsd"></span></td>
    <td class="c-num" data-label="Venta USD c/u"><input class="cell-input num" data-f="saleUsd" inputmode="decimal" value="${it.saleUsd ? qtyFmt(it.saleUsd) : ''}" placeholder="0"></td>
    <td class="c-num" data-label="Venta USD"><span class="calc" data-o="saleUsd"></span></td>
    <td class="c-num" data-label="Ganancia"><span class="calc" data-o="profit"></span></td>
    <td class="c-del"><button class="del" data-act="del" aria-label="Eliminar">✕</button></td>
  </tr>`;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderTable() {
  const onlyPending = $('#onlyPending').checked;
  const list = onlyPending ? state.items.filter(i => !i.ok || isMissing(i)) : state.items;
  tbody.innerHTML = list.map(rowHTML).join('');
  $('#empty').hidden = state.items.length > 0;
  $('#tbl').hidden = state.items.length === 0;
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

function renderTotals() {
  const t = totals();
  const p = $('#sProfit');
  p.textContent = usd(t.profit);
  p.className = 'sum-value ' + (t.profit > 0 ? 'pos' : t.profit < 0 ? 'neg' : '');
  $('#sMargin').textContent = t.margin === null ? '—' : pct(t.margin);
  $('#sCostCup').textContent = cup(t.costCup);
  $('#sCostUsd').textContent = usd(t.costUsd);
  $('#sSaleUsd').textContent = usd(t.saleUsd);
  $('#sProfitCup').textContent = cup(t.profit * state.rate);

  const n = state.combos;
  const pc = $('#perCombo');
  pc.hidden = !(n > 1 && state.items.length);
  if (!pc.hidden) {
    $('#pcCount').textContent = `(de ${n})`;
    $('#pcCost').textContent = usd(t.costUsd / n);
    $('#pcSale').textContent = usd(t.saleUsd / n);
    $('#pcProfit').textContent = usd(t.profit / n);
  }

  const total = state.items.length;
  const done = state.items.filter(i => i.ok).length;
  const miss = state.items.filter(isMissing).length;
  const st = $('#verifyStatus');
  if (!total) { st.textContent = 'Sin productos'; st.className = 'verify-status'; }
  else if (done === total && !miss) { st.textContent = `✓ ${total} productos verificados`; st.className = 'verify-status ok'; }
  else {
    st.textContent = `${done}/${total} verificados` + (miss ? ` · ${miss} sin precio` : '');
    st.className = 'verify-status';
  }
  save();
}

/* ============================================================
   Eventos de la tabla
   ============================================================ */

tbody.addEventListener('input', e => {
  const f = e.target.dataset.f;
  if (!f) return;
  const it = state.items.find(i => i.id === e.target.closest('tr').dataset.id);
  if (!it) return;
  if (f === 'name' || f === 'unit') it[f] = e.target.value;
  else if (f === 'ok') it.ok = e.target.checked;
  else it[f] = num(e.target.value);
  paintRow(it);
  renderTotals();
});

tbody.addEventListener('change', e => {
  if (e.target.dataset.f !== 'ok') return;
  const it = state.items.find(i => i.id === e.target.closest('tr').dataset.id);
  if (!it) return;
  it.ok = e.target.checked;
  paintRow(it);
  renderTotals();
  if ($('#onlyPending').checked) setTimeout(renderTable, 220);
});

tbody.addEventListener('click', e => {
  if (e.target.dataset.act !== 'del') return;
  const tr = e.target.closest('tr');
  state.items = state.items.filter(i => i.id !== tr.dataset.id);
  renderTable();
  toast('Producto eliminado');
});

// Enter salta a la siguiente celda de la misma columna
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

/* ============================================================
   Controles superiores
   ============================================================ */

$('#rate').addEventListener('input', e => {
  state.rate = num(e.target.value);
  state.items.forEach(paintRow);
  renderTotals();
});

$('#combos').addEventListener('input', e => {
  state.combos = Math.max(1, Math.round(num(e.target.value)) || 1);
  renderTotals();
});

document.querySelectorAll('.step').forEach(b => b.addEventListener('click', () => {
  state.combos = Math.max(1, state.combos + Number(b.dataset.step));
  $('#combos').value = state.combos;
  renderTotals();
}));

$('#onlyPending').addEventListener('change', renderTable);

$('#comboName').addEventListener('input', e => { state.name = e.target.textContent.trim(); save(); });

$('#btnAdd').addEventListener('click', () => {
  state.items.push({ id: newId(), name: '', qty: 1, unit: 'u', costCup: 0, saleUsd: 0, ok: false });
  $('#onlyPending').checked = false;
  renderTable();
  const last = tbody.querySelector('tr:last-child [data-f="name"]');
  last?.focus();
  last?.scrollIntoView({ block: 'center', behavior: 'smooth' });
});

function clearAll() {
  if (state.items.length && !confirm('¿Vaciar todos los productos?')) return;
  state.items = [];
  state.name = '';
  $('#comboName').textContent = '';
  renderTable();
  toast('Todo vacío');
}
$('#btnClear').addEventListener('click', clearAll);

/* ============================================================
   Importar
   ============================================================ */

const dlg = $('#dlgImport');
let preview = [];

function openImport() {
  $('#importStep1').hidden = false;
  $('#importStep2').hidden = true;
  dlg.showModal();
  setTimeout(() => $('#rawList').focus(), 60);
}
$('#btnImport').addEventListener('click', openImport);
$('#btnImport2').addEventListener('click', openImport);

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
  updateConfirm();
});

$('#preview').addEventListener('input', e => {
  const k = e.target.dataset.p;
  if (!k) return;
  const row = e.target.closest('.pv-row');
  const p = preview[+row.dataset.i];
  if (k === 'include') { p.include = e.target.checked; row.classList.toggle('off', !p.include); updateConfirm(); }
  else if (k === 'qty') p.qty = num(e.target.value);
  else p[k] = e.target.value;
});

function updateConfirm() {
  const n = preview.filter(p => p.include).length;
  $('#btnConfirm').textContent = n ? `Agregar ${n} producto${n > 1 ? 's' : ''}` : 'Agregar';
  $('#btnConfirm').disabled = !n;
}

$('#btnBack').addEventListener('click', () => {
  $('#importStep1').hidden = false;
  $('#importStep2').hidden = true;
});

$('#btnConfirm').addEventListener('click', () => {
  const chosen = preview.filter(p => p.include && p.name.trim());
  let merged = 0;
  for (const p of chosen) {
    const key = deacc(p.name).toLowerCase().trim();
    const dup = state.items.find(i => deacc(i.name).toLowerCase().trim() === key && i.unit === p.unit);
    if (dup) { dup.qty += p.qty; dup.ok = false; merged++; }
    else state.items.push({ id: newId(), name: p.name.trim(), qty: p.qty, unit: p.unit, costCup: 0, saleUsd: 0, ok: false });
  }
  dlg.close();
  $('#rawList').value = '';
  renderTable();
  toast(`${chosen.length - merged} agregados` + (merged ? ` · ${merged} sumados a existentes` : ''));
});

/* ============================================================
   Menú y exportar
   ============================================================ */

const menu = $('#dlgMenu');
$('#btnMenu').addEventListener('click', () => menu.showModal());

function summaryText() {
  const t = totals();
  const L = [];
  L.push('*' + (state.name || 'Combo') + '*');
  L.push(`Tasa: ${qtyFmt(state.rate)} CUP = 1 USD`);
  if (state.combos > 1) L.push(`Combos: ${state.combos}`);
  L.push('');
  for (const it of state.items) {
    const r = calcRow(it);
    L.push(`• ${it.name} — ${qtyFmt(it.qty)} ${unitFmt(it.unit, it.qty)} — venta ${usd(r.saleUsd)}`);
  }
  L.push('');
  L.push(`Costo: ${cup(t.costCup)} (${usd(t.costUsd)})`);
  L.push(`Venta: ${usd(t.saleUsd)}`);
  L.push(`Ganancia: ${usd(t.profit)}${t.margin === null ? '' : ` (${pct(t.margin)})`}`);
  if (state.combos > 1) L.push(`Por combo: venta ${usd(t.saleUsd / state.combos)} · ganancia ${usd(t.profit / state.combos)}`);
  return L.join('\n');
}

async function copySummary() {
  const txt = summaryText();
  try { await navigator.clipboard.writeText(txt); toast('Resumen copiado'); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove(); toast('Resumen copiado');
  }
}

function downloadCsv() {
  const t = totals();
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const dec = n => String(Math.round(n * 100) / 100).replace('.', ',');
  const rows = [['Producto', 'Cantidad', 'Unidad', 'Costo CUP c/u', 'Costo CUP linea', 'Costo USD linea', 'Venta USD c/u', 'Venta USD linea', 'Ganancia USD']];
  for (const it of state.items) {
    const r = calcRow(it);
    rows.push([it.name, dec(it.qty), it.unit, dec(it.costCup), dec(r.costCup), dec(r.costUsd), dec(it.saleUsd), dec(r.saleUsd), dec(r.profit)]);
  }
  rows.push([]);
  rows.push(['TOTAL', '', '', '', dec(t.costCup), dec(t.costUsd), '', dec(t.saleUsd), dec(t.profit)]);
  rows.push(['Tasa USD', dec(state.rate)]);
  const csv = '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = (state.name || 'combo').replace(/[^\w\sáéíóúñ-]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV descargado');
}

$('#btnCopy').addEventListener('click', copySummary);
$('#btnCsv').addEventListener('click', downloadCsv);
$('#mCopy').addEventListener('click', () => { menu.close(); copySummary(); });
$('#mCsv').addEventListener('click', () => { menu.close(); downloadCsv(); });
$('#mPrint').addEventListener('click', () => { menu.close(); setTimeout(() => print(), 120); });
$('#mClear').addEventListener('click', () => { menu.close(); setTimeout(clearAll, 100); });

/* Resumen desplegable */
$('#summaryToggle').addEventListener('click', () => {
  const btn = $('#summaryToggle');
  const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!open));
  $('#summaryDetail').hidden = open;
});

/* ============================================================
   Toast
   ============================================================ */
let toastT;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ============================================================
   Persistencia
   ============================================================ */
let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
  }, 250);
}

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return;
    const d = JSON.parse(raw);
    state.name = d.name || '';
    state.rate = num(d.rate) || 440;
    state.combos = Math.max(1, Math.round(num(d.combos)) || 1);
    state.items = (d.items || []).map(i => ({
      id: newId(),
      name: i.name || '',
      qty: num(i.qty),
      unit: i.unit || 'u',
      costCup: num(i.costCup),
      saleUsd: num(i.saleUsd),
      ok: !!i.ok
    }));
  } catch {}
}

/* ============================================================
   Arranque
   ============================================================ */
const dl = document.createElement('datalist');
dl.id = 'units';
dl.innerHTML = [...new Set(UNITS.map(u => u[1]))].map(u => `<option value="${u}">`).join('');
document.body.appendChild(dl);

load();
$('#rate').value = qtyFmt(state.rate);
$('#combos').value = state.combos;
$('#comboName').textContent = state.name;
renderTable();

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Solo recarga cuando una versión nueva reemplaza a una anterior
    if (!hadController || refreshing) return;
    refreshing = true;
    location.reload();
  });
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Expuesto para pruebas rápidas en consola
window.__calc = { state, parseLine, parseList, num, totals, summaryText };

})();
