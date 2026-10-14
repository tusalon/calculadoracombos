/* Consignación (admin): a quién le diste producto, qué confirmó, qué vendió y qué te falta cobrar.
   Los datos viven en Supabase (tablas consignees / consign_lines, ver supabase-consignacion.sql)
   porque quien recibe los ve y marca desde su propio enlace. */

import { $, esc, toast } from './core.js';
import { sb } from './auth.js';
import { copiar } from './combo.js';

let datos = [];

const enlaceDe = t => `${new URL('c.html', location.href).href}#${t}`;

// Un teléfono de 8 dígitos que empieza por 5 es cubano: se le pone el 53.
function telWa(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length === 8 && d[0] === '5' ? '53' + d : d;
}

const falla = e => toast('No se pudo: ' + (e?.message || e));

/* ---------- Datos ---------- */

export async function renderConsignacion() {
  const cont = $('#consLista');
  if (!sb) { cont.innerHTML = '<p class="nada">La consignación necesita internet y tu cuenta iniciada.</p>'; return; }
  cont.innerHTML = '<p class="nada">Cargando…</p>';
  try {
    const { data, error } = await sb.from('consignees')
      .select('*, consign_lines(*)').order('created_at', { ascending: false });
    if (error) throw error;
    datos = (data || []).map(c => ({ ...c, lineas: (c.consign_lines || []).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) }));
    pintar();
  } catch (e) {
    cont.innerHTML = `<p class="nada">No se pudo cargar: ${esc(e.message || e)}<br>¿Ya corriste <b>supabase-consignacion.sql</b> en Supabase?</p>`;
  }
}

/* ---------- Pantalla ---------- */

function pintar() {
  const L = datos.flatMap(c => c.lineas);
  $('#consDebe').textContent = L.reduce((s, l) => s + l.vendido - l.pagado, 0);
  $('#consCalle').textContent = L.reduce((s, l) => s + l.recibido - l.vendido, 0);
  $('#consSinConfirmar').textContent = L.reduce((s, l) => s + l.enviado - l.recibido, 0);

  $('#consEmpty').hidden = datos.length > 0;
  $('#consLista').innerHTML = datos.map(c => {
    const debe = c.lineas.reduce((s, l) => s + l.vendido - l.pagado, 0);
    return `<article class="hist-card" data-id="${c.id}">
      <header class="hist-head">
        <div class="hist-title"><h3>${esc(c.nombre)}</h3>
          <p class="hist-meta">${esc(c.telefono || 'sin teléfono')}</p></div>
        <div class="hist-profit"><strong class="${debe ? 'warn' : ''}">${debe}</strong><span>por cobrar</span></div>
      </header>
      ${c.lineas.length ? c.lineas.map(lineaHTML).join('') : '<p class="cons-sub">Sin productos todavía.</p>'}
      <footer class="hist-actions">
        <button class="btn btn-sm" data-act="producto">+ Producto</button>
        <button class="btn btn-sm" data-act="wa">WhatsApp</button>
        <button class="btn btn-sm btn-quiet" data-act="enlace">Copiar enlace</button>
        <button class="btn btn-sm btn-quiet danger" data-act="borrar">Borrar</button>
      </footer>
    </article>`;
  }).join('');
}

function lineaHTML(l) {
  const sin = l.enviado - l.recibido, debe = l.vendido - l.pagado;
  return `<div class="cons-line" data-line="${l.id}">
    <div class="cons-prod">
      <b>${esc(l.producto)}</b>
      <span class="cons-sub">Enviado ${l.enviado} · Recibido ${l.recibido}${sin ? ` <i class="warn">(${sin} sin confirmar)</i>` : ''} · Vendido ${l.vendido} · Pagado ${l.pagado}</span>
      ${debe ? `<span class="cons-owe">Por cobrar: ${debe}</span>` : ''}
    </div>
    <div class="cons-btns">
      <button class="btn btn-sm" data-act="mas">+ Enviar</button>
      <button class="btn btn-sm btn-primary" data-act="pagar" ${debe ? '' : 'disabled'}>Pagado</button>
      <button class="btn btn-sm btn-quiet danger" data-act="quitar" aria-label="Quitar producto">✕</button>
    </div>
  </div>`;
}

/* ---------- Acciones ---------- */

async function sumar(lineId, enviado, pagado) {
  const { error } = await sb.rpc('consign_admin_sumar', { p_line: lineId, p_enviado: enviado, p_pagado: pagado });
  if (error) throw error;
}

const pedirN = (txt, def) => {
  const r = prompt(txt, def ?? '');
  if (r === null) return null;
  const n = parseInt(r, 10);
  if (!Number.isInteger(n) || n < 1) { toast('Pon un número mayor que 0'); return null; }
  return n;
};

async function alClic(e) {
  const act = e.target.dataset.act;
  if (!act) return;
  const card = e.target.closest('.hist-card');
  const c = datos.find(x => x.id === card?.dataset.id);
  if (!c) return;
  const lineEl = e.target.closest('.cons-line');
  const l = lineEl && c.lineas.find(x => x.id === lineEl.dataset.line);

  try {
    if (act === 'mas' && l) {
      const n = pedirN(`¿Cuántas unidades más de ${l.producto} le envías a ${c.nombre}?`);
      if (n) { await sumar(l.id, n, 0); toast('Enviado: él debe confirmar que lo recibió'); }
    }
    if (act === 'pagar' && l) {
      const max = l.vendido - l.pagado;
      const n = pedirN(`¿Cuántas de ${l.producto} te pagó ${c.nombre}? (por cobrar: ${max})`, max);
      if (n) { await sumar(l.id, 0, n); toast('Cobro registrado'); }
    }
    if (act === 'quitar' && l && confirm(`¿Quitar ${l.producto} de ${c.nombre}? Se borra su historial.`)) {
      const { error } = await sb.from('consign_lines').delete().eq('id', l.id);
      if (error) throw error;
    }
    if (act === 'producto') {
      const nombre = (prompt(`Producto para ${c.nombre} (ej: Picadillo):`) || '').trim();
      if (!nombre) return;
      const n = pedirN(`¿Cuántas unidades de ${nombre}?`);
      if (!n) return;
      const { error } = await sb.from('consign_lines').insert({ consignee_id: c.id, producto: nombre, enviado: n });
      if (error) throw error;
      toast('Producto añadido');
    }
    if (act === 'enlace') { await copiar(enlaceDe(c.token), 'Enlace copiado'); return; }
    if (act === 'wa') {
      const msg = `Hola ${c.nombre}, aquí puedes ver tu consignación, confirmar lo que recibes y marcar lo que vendes: ${enlaceDe(c.token)}`;
      window.open(`https://wa.me/${telWa(c.telefono)}?text=${encodeURIComponent(msg)}`, '_blank');
      return;
    }
    if (act === 'borrar' && confirm(`¿Borrar a ${c.nombre} y todo su historial de consignación?`)) {
      const { error } = await sb.from('consignees').delete().eq('id', c.id);
      if (error) throw error;
    }
  } catch (err) { falla(err); }
  await renderConsignacion();
}

async function guardarPersona() {
  const nombre = $('#cpNombre').value.trim();
  const producto = $('#cpProducto').value.trim();
  const cant = parseInt($('#cpCant').value, 10);
  if (!nombre) { toast('Pon el nombre'); $('#cpNombre').focus(); return; }
  if (producto && !(cant >= 1)) { toast('Pon cuántas unidades'); $('#cpCant').focus(); return; }
  try {
    const { data, error } = await sb.from('consignees')
      .insert({ nombre, telefono: $('#cpTel').value.trim() }).select().single();
    if (error) throw error;
    if (producto) {
      const r = await sb.from('consign_lines').insert({ consignee_id: data.id, producto, enviado: cant });
      if (r.error) throw r.error;
    }
    $('#dlgCons').close();
    toast('Listo: envíale su enlace por WhatsApp');
  } catch (err) { falla(err); }
  await renderConsignacion();
}

export function initConsignacion() {
  $('#consNueva').addEventListener('click', () => {
    if (!sb) { toast('Necesitas internet y tu cuenta iniciada'); return; }
    ['cpNombre', 'cpTel', 'cpProducto', 'cpCant'].forEach(id => { $('#' + id).value = ''; });
    $('#dlgCons').showModal();
    setTimeout(() => $('#cpNombre').focus(), 60);
  });
  $('#cpGuardar').addEventListener('click', guardarPersona);
  $('#consRecargar').addEventListener('click', renderConsignacion);
  $('#consLista').addEventListener('click', alClic);
}
