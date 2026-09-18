/* Cuentas, permisos y sincronización con Supabase.
 *
 * Reparto de tareas:
 *   - Supabase manda de verdad: las reglas RLS de supabase.sql deciden quién
 *     lee qué. Lo de aquí solo esconde pestañas para no marear al usuario.
 *   - El disco (localStorage) sigue siendo el guardado inmediato. La nube es
 *     una copia que se sube detrás, para que los datos pasen de un teléfono a otro.
 *   - Sin internet la app sigue abriendo con la última sesión y los últimos
 *     permisos conocidos, y sube lo pendiente en cuanto vuelve la red.
 */

import { $, toast, setCloudSync, setStoreUser, snapshot, leerLocal } from './core.js';
import { SUPABASE_URL, SUPABASE_KEY, configurado } from './config.js';

export const PESTANAS = [
  ['combo', 'Combo'],
  ['historial', 'Historial'],
  ['remesas', 'Remesas'],
  ['trading', 'Compra/Venta'],
  ['planner', 'Combo posible']
];

const PERFIL_CACHE = 'calccombos.perfil';

export let sb = null;         // cliente de Supabase
export let usuario = null;    // sesión de auth
export let perfil = null;     // fila de profiles: nombre, is_admin, activo, perms

/* Las dos decisiones con enjundia, aparte y sin depender de nada,
   para poder probarlas solas (ver test-permisos.mjs). */

// Un admin lo ve todo. Un desactivado no ve nada. El resto, lo que tenga marcado.
export function puedeVer(p, tab) {
  if (!p) return true;                 // sin perfil (modo local, sin cuentas) no se esconde nada
  if (p.activo === false) return false;
  if (p.is_admin) return true;
  return p.perms?.[tab] === true;
}

// Gana la copia con fecha más reciente; sin fecha, gana la del dispositivo.
export function elegirCopia(local, nube) {
  if (!nube) return local || undefined;
  if (!local) return nube;
  const t = x => Date.parse(x?._ts || 0) || 0;
  return t(nube) > t(local) ? nube : local;
}

export const esAdmin = () => !!perfil?.is_admin;
export const puede = tab => puedeVer(perfil, tab);

/* ---------- Conexión ---------- */

function cliente() {
  if (sb) return sb;
  if (!configurado() || !self.supabase) return null;
  sb = self.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return sb;
}

/* ---------- Perfil ---------- */

async function cargarPerfil(id) {
  try {
    const { data, error } = await sb.from('profiles').select('*').eq('id', id).single();
    if (error) throw error;
    localStorage.setItem(PERFIL_CACHE, JSON.stringify(data));
    return data;
  } catch {
    // Sin red: tira del último perfil conocido para no dejar al usuario fuera.
    try {
      const c = JSON.parse(localStorage.getItem(PERFIL_CACHE) || 'null');
      if (c && c.id === id) return c;
    } catch {}
    return null;
  }
}

/* ---------- Datos en la nube ---------- */

async function bajarDatos() {
  try {
    const { data, error } = await sb.from('app_data')
      .select('data, updated_at').eq('user_id', usuario.id).maybeSingle();
    if (error) throw error;
    return data?.data && Object.keys(data.data).length ? data.data : null;
  } catch {
    return null;
  }
}

let pendiente = false;
let subirT;

// El disco se guarda al instante (core.js); la nube espera a que pares de
// escribir. Un combo entero sube en una peticion, no en cuarenta.
function subirLuego(d) {
  clearTimeout(subirT);
  subirT = setTimeout(() => subirDatos(d), 1500);
}

async function subirDatos(d) {
  if (!sb || !usuario) return;
  try {
    const { error } = await sb.from('app_data')
      .upsert({ user_id: usuario.id, data: d }, { onConflict: 'user_id' });
    if (error) throw error;
    pendiente = false;
    marcarEstado('ok');
  } catch {
    pendiente = true;
    marcarEstado('pendiente');
  }
}

// Si se cayó una subida, reintenta con el estado actual en cuanto vuelva la red.
addEventListener('online', () => { if (pendiente) subirDatos(snapshot()); });

function marcarEstado(estado) {
  const el = $('#syncDot');
  if (!el) return;
  el.classList.toggle('pendiente', estado === 'pendiente');
  el.title = estado === 'pendiente'
    ? 'Hay cambios sin subir — se suben solos cuando vuelva internet'
    : 'Todo guardado en la nube';
}

/* ---------- Pantalla de entrada ---------- */

const pantalla = () => $('#authScreen');

function mostrarLogin(msg) {
  pantalla().hidden = false;
  document.body.classList.add('sin-sesion');
  if (msg) $('#authMsg').textContent = msg;
}

function ocultarLogin() {
  pantalla().hidden = true;
  document.body.classList.remove('sin-sesion');
}

function error(e) {
  const m = String(e?.message || e || '');
  if (/Invalid login/i.test(m)) return 'Correo o contraseña incorrectos';
  if (/Email not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar (mira tu bandeja)';
  if (/already registered/i.test(m)) return 'Ese correo ya tiene cuenta';
  if (/at least 6/i.test(m)) return 'La contraseña necesita 6 caracteres como mínimo';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión con el servidor';
  return m || 'Algo salió mal';
}

function cableado() {
  const form = $('#authForm');
  const btnModo = $('#authModo');
  let modo = 'login';

  btnModo.addEventListener('click', () => {
    modo = modo === 'login' ? 'registro' : 'login';
    $('#authTitulo').textContent = modo === 'login' ? 'Entrar' : 'Crear cuenta';
    $('#authSubmit').textContent = modo === 'login' ? 'Entrar' : 'Crear cuenta';
    btnModo.textContent = modo === 'login' ? 'Crear una cuenta' : 'Ya tengo cuenta';
    $('#authNombreCampo').hidden = modo === 'login';
    $('#authMsg').textContent = '';
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#authEmail').value.trim();
    const pass = $('#authPass').value;
    const nombre = $('#authNombre').value.trim();
    if (!email || !pass) return;

    const btn = $('#authSubmit');
    btn.disabled = true;
    $('#authMsg').textContent = 'Un momento…';

    try {
      if (modo === 'registro') {
        const { error: err } = await sb.auth.signUp({
          email, password: pass, options: { data: { nombre } }
        });
        if (err) throw err;
        $('#authMsg').textContent =
          'Cuenta creada. Si Supabase te pide confirmar el correo, ábrelo y vuelve aquí.';
        btn.disabled = false;
        return;
      }
      const { error: err } = await sb.auth.signInWithPassword({ email, password: pass });
      if (err) throw err;
      location.reload();   // arranca limpio ya con sesión
    } catch (e2) {
      $('#authMsg').textContent = error(e2);
      btn.disabled = false;
    }
  });

  $('#btnSalir')?.addEventListener('click', async () => {
    if (!confirm('¿Cerrar la sesión en este dispositivo?')) return;
    await sb.auth.signOut().catch(() => {});
    localStorage.removeItem(PERFIL_CACHE);
    location.reload();
  });
}

/* ---------- Arranque ---------- */

// Devuelve los datos con los que la app debe arrancar, o null si no hay sesión
// (en ese caso deja la pantalla de entrada puesta y la app no sigue).
export async function arrancarAuth() {
  if (!configurado()) {
    // Sin configurar, la app funciona como siempre: local y sin cuentas.
    toast('Supabase sin configurar — modo local');
    return { datos: undefined, anonimo: true };
  }

  const c = cliente();
  if (!c) { mostrarLogin('No se pudo cargar el cliente de Supabase'); return null; }

  cableado();

  const { data: { session } } = await sb.auth.getSession();
  if (!session) { mostrarLogin(''); return null; }

  usuario = session.user;
  perfil = await cargarPerfil(usuario.id);

  if (perfil && perfil.activo === false) {
    await sb.auth.signOut().catch(() => {});
    mostrarLogin('Tu cuenta está desactivada. Habla con el administrador.');
    return null;
  }

  ocultarLogin();
  setStoreUser(usuario.id);

  // De quién son los datos buenos: la copia más nueva gana.
  // ponytail: comparar fechas, no fusionar. Si editas en dos teléfonos a la vez
  // pierdes lo del más viejo; para fusionar de verdad harían falta tablas por entidad.
  const local = leerLocal();
  const nube = await bajarDatos();
  const datos = elegirCopia(local, nube);

  setCloudSync(subirLuego);
  // Primera vez con cuenta y la nube vacía: siembra lo que ya había en el teléfono.
  if (!nube && local) subirDatos(local);

  pintarSesion();
  return { datos };
}

function pintarSesion() {
  const n = $('#sesionNombre');
  if (n) n.textContent = perfil?.nombre || usuario?.email || '';
  const r = $('#sesionRol');
  if (r) r.textContent = esAdmin() ? 'Administrador' : 'Usuario';
  const a = $('#mAdmin');
  if (a) a.hidden = !esAdmin();
}
