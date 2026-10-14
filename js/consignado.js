/* Página de quien recibe en consignación: sin cuenta, solo con su enlace secreto.
   Confirma lo que recibe y marca lo que vende; el admin marca lo que ya cobró. */

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const K_TOKEN = 'consign.token';
const K_ULTIMO = 'consign.ultimo';

/* ---------- Enlace ---------- */

// El enlace trae el secreto en el #fragmento (no viaja al servidor). Se guarda
// y se limpia la barra: así la app instalada abre sola, sin el enlace.
const valido = t => /^[a-f0-9]{64}$/.test(t || '');
let token = '';
try {
  const h = location.hash.slice(1);
  if (valido(h)) { localStorage.setItem(K_TOKEN, h); history.replaceState(null, '', location.pathname); }
  token = localStorage.getItem(K_TOKEN) || '';
} catch {}

const cl = self.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

let datos = null;
let enLinea = true;

/* ---------- Datos ---------- */

async function cargar() {
  if (!valido(token)) { estado('Este enlace no es válido. Pídele a quien te lo dio que te lo envíe otra vez.', true); return; }
  estado('Actualizando…');
  try {
    const { data, error } = await cl.rpc('consign_ver', { p_token: token });
    if (error) throw error;
    if (!data) {
      localStorage.removeItem(K_TOKEN);
      localStorage.removeItem(K_ULTIMO);
      datos = null; pintar();
      estado('Este enlace ya no está activo. Pídele uno nuevo a quien te lo dio.', true);
      return;
    }
    datos = data; enLinea = true;
    localStorage.setItem(K_ULTIMO, JSON.stringify({ data, at: Date.now() }));
    estado('');
  } catch {
    // Sin conexión: se muestra lo último que se vio, solo para mirar.
    enLinea = false;
    try {
      const u = JSON.parse(localStorage.getItem(K_ULTIMO) || 'null');
      if (u) { datos = u.data; estado('Sin conexión — esto es lo último que viste. No puedes marcar nada hasta volver a conectarte.', true); }
      else estado('Sin conexión y todavía no hay nada guardado.', true);
    } catch { estado('Sin conexión.', true); }
  }
  pintar();
}

async function accion(nombre, args) {
  if (!enLinea) { toast('Sin conexión'); return; }
  try {
    const { error } = await cl.rpc(nombre, { p_token: token, ...args });
    if (error) throw error;
  } catch (e) {
    toast(/no valida/.test(e.message || '') ? 'Esa cantidad no es posible' : 'No se pudo guardar, intenta otra vez');
  }
  await cargar();
}

/* ---------- Pantalla ---------- */

function pintar() {
  const L = datos?.lineas || [];
  $('#cNombre').textContent = datos?.nombre ? `Hola, ${datos.nombre}` : 'Mi consignación';
  $('#cResumen').hidden = !L.length;
  $('#cMano').textContent = L.reduce((s, l) => s + l.recibido - l.vendido, 0);
  $('#cDebe').textContent = L.reduce((s, l) => s + l.vendido - l.pagado, 0);
  $('#cPagado').textContent = L.reduce((s, l) => s + l.pagado, 0);

  const pendientes = L.filter(l => l.enviado > l.recibido);
  $('#cLista').innerHTML = (pendientes.length > 1
    ? `<div class="panel cons-recibir"><p>Tienes <b>${pendientes.length}</b> envíos por confirmar.</p>
         <button class="btn btn-primary" data-act="rec-todo">Recibí todo, está bien</button></div>` : '')
    + L.map(l => {
      const falta = l.enviado - l.recibido, mano = l.recibido - l.vendido, debe = l.vendido - l.pagado;
      return `<article class="rem-card cons-card" data-id="${l.id}">
        <h3>${esc(l.producto)}</h3>
        ${falta > 0 ? `<div class="cons-recibir"><p>Te enviaron <b>${falta}</b>${l.recibido ? ' más' : ''}. ¿Te llegó bien?</p>
          <button class="btn btn-primary" data-act="rec">Recibí ${falta}, está bien</button></div>` : ''}
        <div class="cons-big"><strong>${mano}</strong><span>en tu mano</span></div>
        <p class="cons-sub">Vendidos: <b>${l.vendido}</b> · Por pagar: <b class="warn">${debe}</b> · Pagados: <b class="pos">${l.pagado}</b></p>
        <div class="rem-actions">
          <button class="btn btn-primary" data-act="v1" ${mano < 1 ? 'disabled' : ''}>Vendí 1</button>
          <button class="btn" data-act="vn" ${mano < 1 ? 'disabled' : ''}>Vendí varios</button>
          <button class="btn btn-quiet" data-act="d1" ${l.vendido <= l.pagado ? 'disabled' : ''}>Deshacer 1</button>
        </div>
      </article>`;
    }).join('')
    + (datos && !L.length ? '<p class="nada">Todavía no tienes productos. Cuando te envíen, aparecen aquí.</p>' : '');
}

function estado(txt, aviso = false) {
  const e = $('#cEstado');
  e.textContent = txt;
  e.className = 'cons-estado' + (aviso ? ' aviso' : '');
  e.hidden = !txt;
}

let toastT;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- Eventos ---------- */

$('#cLista').addEventListener('click', e => {
  const act = e.target.dataset.act;
  if (!act) return;
  if (act === 'rec-todo') return accion('consign_recibir', {});
  const id = e.target.closest('.cons-card')?.dataset.id;
  const l = datos?.lineas.find(x => x.id === id);
  if (!l) return;
  if (act === 'rec') accion('consign_recibir', { p_line: id });
  if (act === 'v1') accion('consign_vender', { p_line: id, p_n: 1 });
  if (act === 'd1') accion('consign_vender', { p_line: id, p_n: -1 });
  if (act === 'vn') {
    const max = l.recibido - l.vendido;
    const n = parseInt(prompt(`¿Cuántos vendiste de ${l.producto}? (máximo ${max})`, ''), 10);
    if (Number.isInteger(n) && n >= 1 && n <= max) accion('consign_vender', { p_line: id, p_n: n });
    else if (!Number.isNaN(n)) toast('Esa cantidad no es posible');
  }
});

$('#cActualizar').addEventListener('click', cargar);
document.addEventListener('visibilitychange', () => { if (!document.hidden && valido(token)) cargar(); });
addEventListener('online', cargar);

/* ---------- Instalar como app ---------- */

let evInstalar = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  evInstalar = e;
  $('#cInstalar').hidden = false;
  $('#cInstalarBtn').hidden = false;
});
$('#cInstalarBtn').addEventListener('click', async () => {
  if (!evInstalar) return;
  evInstalar.prompt();
  await evInstalar.userChoice;
  evInstalar = null;
  $('#cInstalar').hidden = true;
});
addEventListener('appinstalled', () => { $('#cInstalar').hidden = true; });
if (/iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone) {
  $('#cInstalar').hidden = false;
  $('#cInstalarIos').hidden = false;
}

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

cargar();
