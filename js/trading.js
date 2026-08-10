/* Compra/venta de USD: comprado a una tasa, vendido a otra, la diferencia es la ganancia */

import {
  $, state, newId, num, usd, cup, qtyFmt, pct, esc,
  fechaHora, fechaCorta, mesLargo, claveMes, mesActual,
  toast, save, nowIso
} from './core.js';
import { descargarCsv, copiar, dec } from './combo.js';

let onChanged = () => {};
let filtro = 'todas';
let editando = null;

/* ============================================================
   Cálculo de una operación
   ============================================================ */

export function calcTrade(t) {
  const costoCup = t.monto * t.tasaCompra;
  const vendida = t.status === 'vendida' && t.tasaVenta > 0;
  const ventaCup = vendida ? t.monto * t.tasaVenta : null;
  const gananciaCup = vendida ? ventaCup - costoCup : null;
  return {
    costoCup,
    ventaCup,
    gananciaCup,
    gananciaUsd: gananciaCup !== null && state.rate > 0 ? gananciaCup / state.rate : null,
    diferencia: t.tasaVenta > 0 ? t.tasaVenta - t.tasaCompra : null
  };
}

export function estadisticas() {
  const s = {
    gananciaTotal: 0, gananciaMes: 0,
    pendienteMonto: 0, pendienteCostoCup: 0, pendienteCount: 0,
    volumen: 0, count: state.trades.length,
    porMes: new Map()
  };
  const mes = mesActual();

  for (const t of state.trades) {
    const c = calcTrade(t);
    s.volumen += t.monto;

    const clave = claveMes(t.soldAt || t.createdAt);
    const m = s.porMes.get(clave) || { volumen: 0, ganancia: 0, count: 0 };
    m.volumen += t.monto;
    m.count++;

    if (t.status === 'vendida' && c.gananciaCup !== null) {
      s.gananciaTotal += c.gananciaCup;
      m.ganancia += c.gananciaCup;
      if (clave === mes) s.gananciaMes += c.gananciaCup;
    } else {
      s.pendienteMonto += t.monto;
      s.pendienteCostoCup += c.costoCup;
      s.pendienteCount++;
    }
    s.porMes.set(clave, m);
  }
  return s;
}

/* ============================================================
   Render
   ============================================================ */

export function renderTrading() {
  const st = estadisticas();

  $('#tGanTotal').textContent = cup(st.gananciaTotal);
  $('#tGanTotal').className = 'stat-value ' + (st.gananciaTotal > 0 ? 'pos' : st.gananciaTotal < 0 ? 'neg' : '');
  $('#tGanMes').textContent = cup(st.gananciaMes);
  $('#tPendiente').textContent = usd(st.pendienteMonto);
  $('#tPendienteN').textContent = st.pendienteCount === 0
    ? 'nada por vender'
    : `${cup(st.pendienteCostoCup)} invertidos`;
  $('#tVolumen').textContent = usd(st.volumen);
  $('#tVolumenN').textContent = `${st.count} operaci${st.count === 1 ? 'ón' : 'ones'}`;

  const meses = [...st.porMes.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 12);
  const tope = Math.max(1, ...meses.map(([, m]) => Math.abs(m.volumen)));
  $('#tMeses').innerHTML = meses.map(([clave, m]) => `
    <div class="mes-row">
      <div class="mes-top">
        <span class="mes-name">${mesLargo(clave)}</span>
        <span class="mes-gan ${m.ganancia > 0 ? 'pos' : m.ganancia < 0 ? 'neg' : ''}">${cup(m.ganancia)}</span>
      </div>
      <div class="mes-bar"><span style="width:${(Math.abs(m.volumen) / tope * 100).toFixed(1)}%"></span></div>
      <div class="mes-sub">${usd(m.volumen)} comprados · ${m.count} operaci${m.count === 1 ? 'ón' : 'ones'}</div>
    </div>`).join('');
  $('#tMesesWrap').hidden = meses.length === 0;

  const lista = state.trades
    .filter(t => filtro === 'todas' || t.status === filtro)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  $('#tEmpty').hidden = state.trades.length > 0;
  $('#tList').hidden = state.trades.length === 0;
  $('#tFilters').hidden = state.trades.length === 0;

  $('#tList').innerHTML = lista.length ? lista.map(t => {
    const c = calcTrade(t);
    return `<article class="rem-card ${t.status === 'pendiente' ? 'pendiente' : ''}" data-id="${t.id}">
      <header class="rem-head">
        <div>
          <h3>${usd(t.monto)}</h3>
          <p class="rem-meta">${fechaCorta(t.createdAt)}${t.nota ? ' · ' + esc(t.nota) : ''}</p>
        </div>
        <span class="badge ${t.status === 'vendida' ? 'pagada' : 'pendiente'}">${t.status === 'vendida' ? 'Vendida' : 'Pendiente'}</span>
      </header>
      <div class="chain">
        <div class="chain-step"><span>Comprado</span><strong>${qtyFmt(t.tasaCompra)} <small>CUP/$</small></strong></div>
        <div class="chain-step">
          <span>Vendido</span><strong>${t.tasaVenta > 0 ? qtyFmt(t.tasaVenta) + ' CUP/$' : '—'}</strong>
          ${c.diferencia ? `<em class="delta ${c.diferencia > 0 ? 'pos' : 'neg'}" title="diferencia por dólar">${c.diferencia > 0 ? '+' : ''}${qtyFmt(c.diferencia)}</em>` : ''}
        </div>
        <div class="chain-step"><span>Costo</span><strong>${cup(c.costoCup)}</strong></div>
      </div>
      <footer class="rem-foot">
        <div class="rem-gan">
          <span>Ganancia</span>
          <strong class="${c.gananciaCup > 0 ? 'pos' : c.gananciaCup < 0 ? 'neg' : ''}">${c.gananciaCup === null ? '—' : cup(c.gananciaCup)}</strong>
        </div>
        <div class="rem-actions">
          <button class="btn btn-sm btn-quiet" data-act="editar">Editar</button>
          <button class="btn btn-sm btn-quiet danger" data-act="borrar">✕</button>
        </div>
      </footer>
    </article>`;
  }).join('') : `<p class="nada">No hay operaciones ${filtro === 'vendida' ? 'vendidas' : 'pendientes'}.</p>`;
}

/* ============================================================
   Formulario
   ============================================================ */

function abrirForm(t = null) {
  editando = t ? t.id : null;
  $('#tFormTitle').textContent = t ? 'Editar operación' : 'Nueva compra de USD';
  $('#g_monto').value = t?.monto ? qtyFmt(t.monto) : '';
  $('#g_tasaCompra').value = t?.tasaCompra ? qtyFmt(t.tasaCompra) : '';
  $('#g_tasaVenta').value = t?.tasaVenta ? qtyFmt(t.tasaVenta) : '';
  $('#g_nota').value = t?.nota || '';
  $('#g_status').value = t ? t.status : 'pendiente';
  $('#g_tasaCompra').placeholder = qtyFmt(state.rate);
  $('#g_tasaVenta').placeholder = qtyFmt(state.rate);
  sincronizarForm();
  $('#dlgTrade').showModal();
  setTimeout(() => $('#g_monto').focus(), 60);
}

function leerForm() {
  return {
    monto: num($('#g_monto').value),
    tasaCompra: num($('#g_tasaCompra').value),
    tasaVenta: num($('#g_tasaVenta').value),
    nota: $('#g_nota').value.trim(),
    status: $('#g_status').value === 'vendida' ? 'vendida' : 'pendiente'
  };
}

function sincronizarForm() {
  const borrador = leerForm();
  const c = calcTrade(borrador);
  $('#gPrevCosto').textContent = cup(c.costoCup);
  $('#gPrevVenta').textContent = c.ventaCup === null ? '—' : cup(c.ventaCup);
  $('#gPrevDif').textContent = c.diferencia === null ? '—' : (c.diferencia > 0 ? '+' : '') + qtyFmt(c.diferencia) + ' CUP/$';
  $('#gPrevDif').className = 'fprev-v ' + (c.diferencia > 0 ? 'pos' : c.diferencia < 0 ? 'neg' : '');
  $('#gPrevGanancia').textContent = c.gananciaCup === null ? '—' : cup(c.gananciaCup);
  $('#gPrevGanancia').className = 'fprev-v big ' + (c.gananciaCup > 0 ? 'pos' : c.gananciaCup < 0 ? 'neg' : '');
}

function guardarForm() {
  const d = leerForm();
  if (!d.monto || !d.tasaCompra) { toast('Pon el monto y la tasa de compra'); $('#g_monto').focus(); return; }
  if (d.status === 'vendida' && !d.tasaVenta) { toast('Pon la tasa de venta para marcarla vendida'); $('#g_tasaVenta').focus(); return; }

  if (editando) {
    const t = state.trades.find(x => x.id === editando);
    if (t) {
      const eraPendiente = t.status === 'pendiente';
      Object.assign(t, d);
      if (eraPendiente && d.status === 'vendida') t.soldAt = nowIso();
      if (d.status === 'pendiente') t.soldAt = null;
      toast('Operación actualizada');
    }
  } else {
    state.trades.unshift({
      id: newId('t'),
      createdAt: nowIso(),
      soldAt: d.status === 'vendida' ? nowIso() : null,
      ...d
    });
    toast('Compra registrada');
  }
  save();
  $('#dlgTrade').close();
  renderTrading();
  onChanged();
}

/* ============================================================
   Exportar
   ============================================================ */

function csvTrading() {
  if (!state.trades.length) { toast('No hay operaciones que exportar'); return; }
  const filas = [['Fecha', 'Estado', 'Monto USD', 'Tasa compra', 'Tasa venta', 'Costo CUP', 'Venta CUP', 'Ganancia CUP', 'Nota']];
  for (const t of [...state.trades].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))) {
    const c = calcTrade(t);
    filas.push([fechaHora(t.createdAt), t.status, dec(t.monto), dec(t.tasaCompra), dec(t.tasaVenta), dec(c.costoCup), c.ventaCup === null ? '' : dec(c.ventaCup), c.gananciaCup === null ? '' : dec(c.gananciaCup), t.nota]);
  }
  const st = estadisticas();
  filas.push([]);
  filas.push(['TOTAL', '', dec(st.volumen), '', '', '', '', dec(st.gananciaTotal)]);
  descargarCsv(filas, 'compra-venta-usd');
}

function resumenTrading() {
  const st = estadisticas();
  const L = ['*Compra/venta de USD*'];
  L.push(`Ganancia total: ${cup(st.gananciaTotal)}`);
  L.push(`Ganancia del mes: ${cup(st.gananciaMes)}`);
  L.push(`Por vender: ${usd(st.pendienteMonto)} (${st.pendienteCount})`);
  L.push(`Volumen comprado: ${usd(st.volumen)} en ${st.count} operaciones`);
  return L.join('\n');
}

/* ============================================================
   Conexión con el DOM
   ============================================================ */

export function initTrading(notify) {
  onChanged = notify || (() => {});

  $('#btnNuevaCompra').addEventListener('click', () => abrirForm());
  $('#btnNuevaCompra2').addEventListener('click', () => abrirForm());
  $('#btnTradeGuardar').addEventListener('click', guardarForm);
  $('#btnTradingCsv').addEventListener('click', csvTrading);
  $('#btnTradingCopy').addEventListener('click', () => copiar(resumenTrading(), 'Resumen copiado'));

  $('#dlgTrade').addEventListener('input', sincronizarForm);
  $('#g_status').addEventListener('change', sincronizarForm);

  $('#tFilters').addEventListener('click', e => {
    const f = e.target.dataset.filtro;
    if (!f) return;
    filtro = f;
    document.querySelectorAll('#tFilters .chip').forEach(c => c.classList.toggle('on', c.dataset.filtro === f));
    renderTrading();
  });

  $('#tList').addEventListener('click', e => {
    const act = e.target.dataset.act;
    if (!act) return;
    const t = state.trades.find(x => x.id === e.target.closest('.rem-card').dataset.id);
    if (!t) return;

    if (act === 'editar') abrirForm(t);

    if (act === 'borrar') {
      if (!confirm(`¿Borrar la compra de ${usd(t.monto)}?`)) return;
      state.trades = state.trades.filter(x => x.id !== t.id);
      save();
      renderTrading();
      onChanged();
      toast('Operación borrada');
    }
  });
}
