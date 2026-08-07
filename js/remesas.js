/* Remesas: Zelle recibido -> efectivo USD en mano -> entregado en USD o CUP */

import {
  $, state, newId, num, usd, cup, qtyFmt, pct, esc,
  fechaHora, fechaCorta, mesLargo, claveMes, mesActual,
  toast, save, nowIso
} from './core.js';
import { descargarCsv, copiar, dec } from './combo.js';

let onChanged = () => {};
let filtro = 'todas';
let editando = null;   // id de la remesa en edición, o null si es nueva

/* ============================================================
   Cálculo de una remesa
   ============================================================ */

export function calcRemesa(r) {
  // Si no anotas el efectivo, se asume que es lo mismo que entró por Zelle
  const efectivo = r.efectivo > 0 ? r.efectivo : r.zelle;
  const tasa = r.tasa > 0 ? r.tasa : state.rate;
  const entregadoUsd = r.entregadoCur === 'CUP'
    ? (tasa > 0 ? r.entregado / tasa : 0)
    : r.entregado;
  return {
    efectivo,
    tasa,
    entregadoUsd,
    cambio: efectivo - r.zelle,        // lo que ganas o pierdes al sacar el Zelle
    ganancia: efectivo - entregadoUsd  // lo que te queda en la mano
  };
}

export function estadisticas() {
  const s = {
    gananciaTotal: 0, gananciaMes: 0,
    pendienteUsd: 0, pendienteCount: 0,
    volumen: 0, count: state.remesas.length,
    porMes: new Map()
  };
  const mes = mesActual();

  for (const r of state.remesas) {
    const c = calcRemesa(r);
    s.volumen += r.zelle;

    const clave = claveMes(r.paidAt || r.createdAt);
    const m = s.porMes.get(clave) || { volumen: 0, ganancia: 0, count: 0 };
    m.volumen += r.zelle;
    m.count++;

    if (r.status === 'pagada') {
      s.gananciaTotal += c.ganancia;
      m.ganancia += c.ganancia;
      if (clave === mes) s.gananciaMes += c.ganancia;
    } else {
      s.pendienteUsd += c.entregadoUsd;
      s.pendienteCount++;
    }
    s.porMes.set(clave, m);
  }
  s.margen = s.volumen > 0 ? (s.gananciaTotal / s.volumen) * 100 : null;
  return s;
}

/* ============================================================
   Render
   ============================================================ */

export function renderRemesas() {
  const st = estadisticas();

  $('#rGanTotal').textContent = usd(st.gananciaTotal);
  $('#rGanTotal').className = 'stat-value ' + (st.gananciaTotal > 0 ? 'pos' : st.gananciaTotal < 0 ? 'neg' : '');
  $('#rGanMes').textContent = usd(st.gananciaMes);
  $('#rPendiente').textContent = usd(st.pendienteUsd);
  $('#rPendienteN').textContent = st.pendienteCount === 0
    ? 'nada por entregar'
    : `${st.pendienteCount} remesa${st.pendienteCount === 1 ? '' : 's'} por entregar`;
  $('#rVolumen').textContent = usd(st.volumen);
  $('#rVolumenN').textContent = `${st.count} remesa${st.count === 1 ? '' : 's'}${st.margen === null ? '' : ` · margen ${pct(st.margen)}`}`;

  // Desglose mes a mes
  const meses = [...st.porMes.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 12);
  const tope = Math.max(1, ...meses.map(([, m]) => Math.abs(m.volumen)));
  $('#rMeses').innerHTML = meses.map(([clave, m]) => `
    <div class="mes-row">
      <div class="mes-top">
        <span class="mes-name">${mesLargo(clave)}</span>
        <span class="mes-gan ${m.ganancia > 0 ? 'pos' : m.ganancia < 0 ? 'neg' : ''}">${usd(m.ganancia)}</span>
      </div>
      <div class="mes-bar"><span style="width:${(Math.abs(m.volumen) / tope * 100).toFixed(1)}%"></span></div>
      <div class="mes-sub">${usd(m.volumen)} movidos · ${m.count} remesa${m.count === 1 ? '' : 's'}</div>
    </div>`).join('');
  $('#rMesesWrap').hidden = meses.length === 0;

  // Lista
  const lista = state.remesas
    .filter(r => filtro === 'todas' || r.status === filtro)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  $('#rEmpty').hidden = state.remesas.length > 0;
  $('#rList').hidden = state.remesas.length === 0;
  $('#rFilters').hidden = state.remesas.length === 0;

  $('#rList').innerHTML = lista.length ? lista.map(r => {
    const c = calcRemesa(r);
    const quien = [r.cliente, r.destinatario].filter(Boolean).join(' → ') || 'Sin nombre';
    const entregado = r.entregadoCur === 'CUP'
      ? `${cup(r.entregado)} <small>(${usd(c.entregadoUsd)})</small>`
      : usd(r.entregado);
    return `<article class="rem-card ${r.status}" data-id="${r.id}">
      <header class="rem-head">
        <div>
          <h3>${esc(quien)}</h3>
          <p class="rem-meta">${fechaCorta(r.createdAt)}${r.telefono ? ' · ' + esc(r.telefono) : ''}</p>
        </div>
        <span class="badge ${r.status}">${r.status === 'pagada' ? 'Pagada' : 'Pendiente'}</span>
      </header>
      <div class="chain">
        <div class="chain-step"><span>Zelle</span><strong>${usd(r.zelle)}</strong></div>
        <div class="chain-step">
          <span>Efectivo</span><strong>${usd(c.efectivo)}</strong>
          ${c.cambio === 0 ? '' : `<em class="delta ${c.cambio > 0 ? 'pos' : 'neg'}" title="diferencia al cambiar el Zelle">${c.cambio > 0 ? '+' : ''}${usd(c.cambio)}</em>`}
        </div>
        <div class="chain-step"><span>Entregado</span><strong>${entregado}</strong></div>
      </div>
      ${r.nota ? `<p class="rem-nota">${esc(r.nota)}</p>` : ''}
      <footer class="rem-foot">
        <div class="rem-gan">
          <span>Ganancia</span>
          <strong class="${c.ganancia > 0 ? 'pos' : c.ganancia < 0 ? 'neg' : ''}">${usd(c.ganancia)}</strong>
        </div>
        <div class="rem-actions">
          ${r.status === 'pendiente' ? '<button class="btn btn-sm btn-primary" data-act="pagar">Marcar pagada</button>' : ''}
          <button class="btn btn-sm btn-quiet" data-act="editar">Editar</button>
          <button class="btn btn-sm btn-quiet danger" data-act="borrar">✕</button>
        </div>
      </footer>
    </article>`;
  }).join('') : `<p class="nada">No hay remesas ${filtro === 'pagada' ? 'pagadas' : 'pendientes'}.</p>`;
}

/* ============================================================
   Formulario
   ============================================================ */

const campos = ['cliente', 'destinatario', 'telefono', 'zelle', 'efectivo', 'entregado', 'tasa', 'nota'];

function abrirForm(r = null) {
  editando = r ? r.id : null;
  $('#rFormTitle').textContent = r ? 'Editar remesa' : 'Nueva remesa';
  for (const k of campos) {
    const el = $('#f_' + k);
    if (!el) continue;
    const v = r ? r[k] : '';
    el.value = (typeof v === 'number') ? (v ? qtyFmt(v) : '') : (v || '');
  }
  $('#f_entregadoCur').value = r ? r.entregadoCur : 'USD';
  $('#f_status').value = r ? r.status : 'pendiente';
  $('#f_tasa').placeholder = qtyFmt(state.rate);
  sincronizarForm();
  $('#dlgRemesa').showModal();
  setTimeout(() => $('#f_cliente').focus(), 60);
}

// Muestra la tasa solo si se entrega en CUP, y calcula la vista previa
function sincronizarForm() {
  const enCup = $('#f_entregadoCur').value === 'CUP';
  $('#f_tasaWrap').hidden = !enCup;

  const borrador = leerForm();
  const c = calcRemesa(borrador);
  $('#fPrevEfectivo').textContent = usd(c.efectivo);
  $('#fPrevCambio').textContent = c.cambio === 0 ? '—' : (c.cambio > 0 ? '+' : '') + usd(c.cambio);
  $('#fPrevCambio').className = 'fprev-v ' + (c.cambio > 0 ? 'pos' : c.cambio < 0 ? 'neg' : '');
  $('#fPrevEntregado').textContent = usd(c.entregadoUsd);
  $('#fPrevGanancia').textContent = usd(c.ganancia);
  $('#fPrevGanancia').className = 'fprev-v big ' + (c.ganancia > 0 ? 'pos' : c.ganancia < 0 ? 'neg' : '');
}

function leerForm() {
  return {
    cliente: $('#f_cliente').value.trim(),
    destinatario: $('#f_destinatario').value.trim(),
    telefono: $('#f_telefono').value.trim(),
    nota: $('#f_nota').value.trim(),
    zelle: num($('#f_zelle').value),
    efectivo: num($('#f_efectivo').value),
    entregado: num($('#f_entregado').value),
    entregadoCur: $('#f_entregadoCur').value === 'CUP' ? 'CUP' : 'USD',
    tasa: num($('#f_tasa').value),
    status: $('#f_status').value === 'pagada' ? 'pagada' : 'pendiente'
  };
}

function guardarForm() {
  const d = leerForm();
  if (!d.zelle && !d.entregado) { toast('Pon al menos el Zelle recibido'); $('#f_zelle').focus(); return; }

  if (editando) {
    const r = state.remesas.find(x => x.id === editando);
    if (r) {
      const eraPendiente = r.status === 'pendiente';
      Object.assign(r, d);
      if (eraPendiente && d.status === 'pagada') r.paidAt = nowIso();
      if (d.status === 'pendiente') r.paidAt = null;
      toast('Remesa actualizada');
    }
  } else {
    state.remesas.unshift({
      id: newId('r'),
      createdAt: nowIso(),
      paidAt: d.status === 'pagada' ? nowIso() : null,
      ...d
    });
    toast('Remesa registrada');
  }
  save();
  $('#dlgRemesa').close();
  renderRemesas();
  onChanged();
}

/* ============================================================
   Exportar
   ============================================================ */

function csvRemesas() {
  if (!state.remesas.length) { toast('No hay remesas que exportar'); return; }
  const filas = [['Fecha', 'Estado', 'Cliente', 'Destinatario', 'Telefono', 'Zelle USD', 'Efectivo USD', 'Cambio USD', 'Entregado', 'Moneda', 'Tasa', 'Entregado USD', 'Ganancia USD', 'Nota']];
  for (const r of [...state.remesas].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))) {
    const c = calcRemesa(r);
    filas.push([
      fechaHora(r.createdAt), r.status, r.cliente, r.destinatario, r.telefono,
      dec(r.zelle), dec(c.efectivo), dec(c.cambio), dec(r.entregado), r.entregadoCur,
      r.entregadoCur === 'CUP' ? dec(c.tasa) : '', dec(c.entregadoUsd), dec(c.ganancia), r.nota
    ]);
  }
  const st = estadisticas();
  filas.push([]);
  filas.push(['TOTAL', '', '', '', '', dec(st.volumen), '', '', '', '', '', dec(st.pendienteUsd), dec(st.gananciaTotal)]);
  descargarCsv(filas, 'remesas');
}

function resumenRemesas() {
  const st = estadisticas();
  const L = ['*Remesas*'];
  L.push(`Ganancia total: ${usd(st.gananciaTotal)}`);
  L.push(`Ganancia del mes: ${usd(st.gananciaMes)}`);
  L.push(`Por entregar: ${usd(st.pendienteUsd)} (${st.pendienteCount})`);
  L.push(`Volumen movido: ${usd(st.volumen)} en ${st.count} remesas`);
  return L.join('\n');
}

/* ============================================================
   Conexión con el DOM
   ============================================================ */

export function initRemesas(notify) {
  onChanged = notify || (() => {});

  $('#btnNuevaRemesa').addEventListener('click', () => abrirForm());
  $('#btnNuevaRemesa2').addEventListener('click', () => abrirForm());
  $('#btnRemesaGuardar').addEventListener('click', guardarForm);
  $('#btnRemesasCsv').addEventListener('click', csvRemesas);
  $('#btnRemesasCopy').addEventListener('click', () => copiar(resumenRemesas(), 'Resumen copiado'));

  $('#dlgRemesa').addEventListener('input', sincronizarForm);
  $('#f_entregadoCur').addEventListener('change', sincronizarForm);
  $('#f_status').addEventListener('change', sincronizarForm);

  $('#rFilters').addEventListener('click', e => {
    const f = e.target.dataset.filtro;
    if (!f) return;
    filtro = f;
    document.querySelectorAll('#rFilters .chip').forEach(c => c.classList.toggle('on', c.dataset.filtro === f));
    renderRemesas();
  });

  $('#rList').addEventListener('click', e => {
    const act = e.target.dataset.act;
    if (!act) return;
    const r = state.remesas.find(x => x.id === e.target.closest('.rem-card').dataset.id);
    if (!r) return;

    if (act === 'editar') abrirForm(r);

    if (act === 'pagar') {
      r.status = 'pagada';
      r.paidAt = nowIso();
      save();
      renderRemesas();
      onChanged();
      toast('Marcada como pagada');
    }

    if (act === 'borrar') {
      const quien = [r.cliente, r.destinatario].filter(Boolean).join(' → ') || 'esta remesa';
      if (!confirm(`¿Borrar ${quien}?`)) return;
      state.remesas = state.remesas.filter(x => x.id !== r.id);
      save();
      renderRemesas();
      onChanged();
      toast('Remesa borrada');
    }
  });
}
