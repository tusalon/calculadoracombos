/* Compra/venta de USD: registro de compras y de ventas por separado.
   La ganancia se calcula por costo promedio ponderado — cada venta se
   compara contra el costo promedio de lo comprado hasta ese momento,
   así compras y ventas no tienen que emparejarse una a una. */

import {
  $, state, newId, num, usd, cup, qtyFmt, esc,
  fechaHora, fechaCorta, mesLargo, claveMes, mesActual,
  toast, save, nowIso
} from './core.js';
import { descargarCsv, copiar, dec } from './combo.js';

let onChanged = () => {};
let filtro = 'todas';
let editando = null;

/* ============================================================
   Costo promedio ponderado, en orden cronológico
   ============================================================ */

export function calcSerie() {
  const ops = [...state.trades].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  let invUsd = 0, invCostCup = 0;
  const porOp = new Map();
  const mesHoy = mesActual();

  const s = {
    compradoTotal: 0, costoCompraTotal: 0,
    vendidoTotal: 0, ingresoVentaTotal: 0,
    gananciaTotal: 0, gananciaMes: 0,
    count: ops.length,
    porMes: new Map()
  };

  for (const op of ops) {
    const clave = claveMes(op.createdAt);
    const m = s.porMes.get(clave) || { compra: 0, venta: 0, ganancia: 0, count: 0 };
    m.count++;

    if (op.tipo === 'compra') {
      invUsd += op.monto;
      invCostCup += op.monto * op.tasa;
      s.compradoTotal += op.monto;
      s.costoCompraTotal += op.monto * op.tasa;
      m.compra += op.monto;
      porOp.set(op.id, { ganancia: null, tasaCostoProm: null });
    } else {
      const tasaCostoProm = invUsd > 0 ? invCostCup / invUsd : op.tasa;
      const costoDeLoVendido = op.monto * tasaCostoProm;
      const ingreso = op.monto * op.tasa;
      const ganancia = ingreso - costoDeLoVendido;
      invUsd -= op.monto;
      invCostCup -= costoDeLoVendido;
      s.vendidoTotal += op.monto;
      s.ingresoVentaTotal += ingreso;
      s.gananciaTotal += ganancia;
      if (clave === mesHoy) s.gananciaMes += ganancia;
      m.venta += op.monto;
      m.ganancia += ganancia;
      porOp.set(op.id, { ganancia, tasaCostoProm });
    }
    s.porMes.set(clave, m);
  }

  s.tasaCompraProm = s.compradoTotal > 0 ? s.costoCompraTotal / s.compradoTotal : 0;
  s.tasaVentaProm = s.vendidoTotal > 0 ? s.ingresoVentaTotal / s.vendidoTotal : 0;
  s.inventarioUsd = invUsd;
  s.inventarioCostoCup = invCostCup;
  return { stats: s, porOp };
}

/* ============================================================
   Render
   ============================================================ */

export function renderTrading() {
  const { stats: st, porOp } = calcSerie();

  $('#tGanTotal').textContent = cup(st.gananciaTotal);
  $('#tGanTotal').className = 'stat-value ' + (st.gananciaTotal > 0 ? 'pos' : st.gananciaTotal < 0 ? 'neg' : '');
  $('#tGanMes').textContent = cup(st.gananciaMes);
  $('#tPendiente').textContent = usd(st.inventarioUsd);
  $('#tPendiente').className = 'stat-value warn ' + (st.inventarioUsd < 0 ? 'neg' : '');
  $('#tPendienteN').textContent = st.inventarioUsd < 0
    ? 'vendiste más de lo comprado'
    : st.inventarioUsd === 0 ? 'nada sin vender' : `${cup(st.inventarioCostoCup)} en costo`;
  $('#tVolumen').textContent = usd(st.compradoTotal + st.vendidoTotal);
  $('#tVolumenN').textContent = `${st.count} operaci${st.count === 1 ? 'ón' : 'ones'}`
    + (st.compradoTotal ? ` · compra ${qtyFmt(st.tasaCompraProm)}` : '')
    + (st.vendidoTotal ? ` · venta ${qtyFmt(st.tasaVentaProm)}` : '');

  const meses = [...st.porMes.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 12);
  const tope = Math.max(1, ...meses.map(([, m]) => Math.abs(m.compra) + Math.abs(m.venta)));
  $('#tMeses').innerHTML = meses.map(([clave, m]) => `
    <div class="mes-row">
      <div class="mes-top">
        <span class="mes-name">${mesLargo(clave)}</span>
        <span class="mes-gan ${m.ganancia > 0 ? 'pos' : m.ganancia < 0 ? 'neg' : ''}">${cup(m.ganancia)}</span>
      </div>
      <div class="mes-bar"><span style="width:${((m.compra + m.venta) / tope * 100).toFixed(1)}%"></span></div>
      <div class="mes-sub">${usd(m.compra)} comprados · ${usd(m.venta)} vendidos</div>
    </div>`).join('');
  $('#tMesesWrap').hidden = meses.length === 0;

  const lista = state.trades
    .filter(t => filtro === 'todas' || t.tipo === filtro)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  $('#tEmpty').hidden = state.trades.length > 0;
  $('#tList').hidden = state.trades.length === 0;
  $('#tFilters').hidden = state.trades.length === 0;

  $('#tList').innerHTML = lista.length ? lista.map(op => {
    const d = porOp.get(op.id) || { ganancia: null };
    const esCompra = op.tipo === 'compra';
    return `<article class="rem-card" data-id="${op.id}">
      <header class="rem-head">
        <div>
          <h3>${esCompra ? 'Compra' : 'Venta'} · ${usd(op.monto)}</h3>
          <p class="rem-meta">${fechaCorta(op.createdAt)} · ${qtyFmt(op.tasa)} CUP/$${op.nota ? ' · ' + esc(op.nota) : ''}</p>
        </div>
        <span class="badge ${esCompra ? 'pendiente' : 'pagada'}">${esCompra ? 'Compra' : 'Venta'}</span>
      </header>
      <footer class="rem-foot">
        <div class="rem-gan">
          <span>${esCompra ? 'Costo' : 'Ganancia de esta venta'}</span>
          <strong class="${esCompra ? '' : (d.ganancia > 0 ? 'pos' : d.ganancia < 0 ? 'neg' : '')}">${esCompra ? cup(op.monto * op.tasa) : (d.ganancia === null ? '—' : cup(d.ganancia))}</strong>
        </div>
        <div class="rem-actions">
          <button class="btn btn-sm btn-quiet" data-act="editar">Editar</button>
          <button class="btn btn-sm btn-quiet danger" data-act="borrar">✕</button>
        </div>
      </footer>
    </article>`;
  }).join('') : `<p class="nada">No hay ${filtro === 'compra' ? 'compras' : 'ventas'} registradas.</p>`;
}

/* ============================================================
   Formulario
   ============================================================ */

function abrirForm(op = null) {
  editando = op ? op.id : null;
  $('#tFormTitle').textContent = op ? 'Editar operación' : 'Nueva operación';
  $('#g_tipo').value = op ? op.tipo : 'compra';
  $('#g_monto').value = op?.monto ? qtyFmt(op.monto) : '';
  $('#g_tasa').value = op?.tasa ? qtyFmt(op.tasa) : '';
  $('#g_nota').value = op?.nota || '';
  $('#g_tasa').placeholder = qtyFmt(state.rate);
  sincronizarForm();
  $('#dlgTrade').showModal();
  setTimeout(() => $('#g_monto').focus(), 60);
}

function leerForm() {
  return {
    tipo: $('#g_tipo').value === 'venta' ? 'venta' : 'compra',
    monto: num($('#g_monto').value),
    tasa: num($('#g_tasa').value),
    nota: $('#g_nota').value.trim()
  };
}

function sincronizarForm() {
  const d = leerForm();
  const esCompra = d.tipo === 'compra';
  $('#gTasaLabel').textContent = esCompra ? 'Tasa de compra' : 'Tasa de venta';
  $('#gPrevTotalLabel').textContent = esCompra ? 'Costo total' : 'Ingreso total';
  $('#gPrevTotal').textContent = cup(d.monto * d.tasa);

  $('#gPrevGananciaWrap').hidden = esCompra;
  if (!esCompra) {
    // Estimado con el costo promedio de las demás operaciones ya guardadas
    const otras = state.trades.filter(t => t.id !== editando);
    const costoProm = (() => {
      let usd_ = 0, cup_ = 0;
      for (const t of [...otras].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))) {
        if (t.tipo === 'compra') { usd_ += t.monto; cup_ += t.monto * t.tasa; }
        else { const p = usd_ > 0 ? cup_ / usd_ : t.tasa; cup_ -= t.monto * p; usd_ -= t.monto; }
      }
      return usd_ > 0 ? cup_ / usd_ : 0;
    })();
    const ganancia = costoProm > 0 ? d.monto * (d.tasa - costoProm) : null;
    $('#gPrevGanancia').textContent = ganancia === null ? 'sin compras registradas aún' : cup(ganancia);
    $('#gPrevGanancia').className = 'fprev-v big ' + (ganancia > 0 ? 'pos' : ganancia < 0 ? 'neg' : '');
  }
}

function guardarForm() {
  const d = leerForm();
  if (!d.monto || !d.tasa) { toast('Pon el monto y la tasa'); $('#g_monto').focus(); return; }

  if (editando) {
    const t = state.trades.find(x => x.id === editando);
    if (t) { Object.assign(t, d); toast('Operación actualizada'); }
  } else {
    state.trades.unshift({ id: newId('t'), createdAt: nowIso(), ...d });
    toast(d.tipo === 'compra' ? 'Compra registrada' : 'Venta registrada');
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
  const { porOp } = calcSerie();
  const filas = [['Fecha', 'Tipo', 'Monto USD', 'Tasa', 'Total CUP', 'Ganancia CUP', 'Nota']];
  for (const t of [...state.trades].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))) {
    const d = porOp.get(t.id) || { ganancia: null };
    filas.push([fechaHora(t.createdAt), t.tipo, dec(t.monto), dec(t.tasa), dec(t.monto * t.tasa), d.ganancia === null ? '' : dec(d.ganancia), t.nota]);
  }
  const { stats } = calcSerie();
  filas.push([]);
  filas.push(['TOTAL', '', '', '', '', dec(stats.gananciaTotal)]);
  descargarCsv(filas, 'compra-venta-usd');
}

function resumenTrading() {
  const { stats: st } = calcSerie();
  const L = ['*Compra/venta de USD*'];
  L.push(`Ganancia total: ${cup(st.gananciaTotal)}`);
  L.push(`Ganancia del mes: ${cup(st.gananciaMes)}`);
  L.push(`Sin vender: ${usd(st.inventarioUsd)}`);
  L.push(`Comprado: ${usd(st.compradoTotal)} a ${qtyFmt(st.tasaCompraProm)} prom.`);
  L.push(`Vendido: ${usd(st.vendidoTotal)} a ${qtyFmt(st.tasaVentaProm)} prom.`);
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
  $('#g_tipo').addEventListener('change', sincronizarForm);

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
      if (!confirm(`¿Borrar esta ${t.tipo === 'compra' ? 'compra' : 'venta'} de ${usd(t.monto)}?`)) return;
      state.trades = state.trades.filter(x => x.id !== t.id);
      save();
      renderTrading();
      onChanged();
      toast('Operación borrada');
    }
  });
}
