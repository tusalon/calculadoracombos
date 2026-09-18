/* Panel de administración: quién entra y qué puede ver.
 *
 * Solo lo abre un admin, y aunque alguien lo forzara desde la consola no le
 * serviría: las políticas RLS rechazan cualquier cambio que no venga de un admin.
 */

import { $, esc, toast } from './core.js';
import { sb, usuario, esAdmin, PESTANAS } from './auth.js';

let usuarios = [];

const dlg = () => $('#dlgAdmin');

export function initAdmin() {
  const b = $('#mAdmin');
  if (!b) return;
  b.addEventListener('click', () => {
    $('#dlgMenu').close();
    setTimeout(abrir, 100);
  });
  $('#adminRecargar')?.addEventListener('click', cargar);
}

async function abrir() {
  if (!esAdmin()) return;
  dlg().showModal();
  await cargar();
}

async function cargar() {
  const cuerpo = $('#adminLista');
  cuerpo.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    const { data, error } = await sb.from('profiles')
      .select('*').order('created_at', { ascending: true });
    if (error) throw error;
    usuarios = data || [];
    pintar();
  } catch (e) {
    cuerpo.innerHTML = `<p class="muted">No se pudo cargar: ${esc(e.message || e)}</p>`;
  }
}

function pintar() {
  const cuerpo = $('#adminLista');
  if (!usuarios.length) { cuerpo.innerHTML = '<p class="muted">No hay usuarios todavía.</p>'; return; }

  cuerpo.innerHTML = usuarios.map(u => {
    const yo = u.id === usuario.id;
    const perms = u.perms || {};
    const checks = PESTANAS.map(([k, label]) => `
      <label class="adm-chk">
        <input type="checkbox" data-id="${u.id}" data-perm="${k}"
               ${perms[k] ? 'checked' : ''} ${u.is_admin || yo ? 'disabled' : ''}>
        <span>${label}</span>
      </label>`).join('');

    return `
    <article class="adm-user${u.activo ? '' : ' inactivo'}">
      <header class="adm-head">
        <div>
          <b>${esc(u.nombre || '—')}</b>
          ${yo ? '<span class="adm-tag">tú</span>' : ''}
          ${u.is_admin ? '<span class="adm-tag admin">admin</span>' : ''}
          ${u.activo ? '' : '<span class="adm-tag off">desactivado</span>'}
          <span class="adm-mail">${esc(u.email || '')}</span>
        </div>
      </header>
      <div class="adm-perms">
        ${u.is_admin
          ? '<p class="muted">Un administrador ve todas las secciones.</p>'
          : checks}
      </div>
      <footer class="adm-acc">
        ${yo ? '<span class="muted">No puedes cambiar tus propios permisos</span>' : `
          <button class="btn btn-sm" data-accion="admin" data-id="${u.id}">
            ${u.is_admin ? 'Quitar admin' : 'Hacer admin'}
          </button>
          <button class="btn btn-sm" data-accion="activo" data-id="${u.id}">
            ${u.activo ? 'Desactivar' : 'Activar'}
          </button>`}
      </footer>
    </article>`;
  }).join('');

  cuerpo.querySelectorAll('input[data-perm]').forEach(i =>
    i.addEventListener('change', () => cambiarPerm(i.dataset.id, i.dataset.perm, i.checked)));

  cuerpo.querySelectorAll('button[data-accion]').forEach(b =>
    b.addEventListener('click', () => alternar(b.dataset.id, b.dataset.accion)));
}

async function guardar(id, cambios, deshacer) {
  try {
    const { error } = await sb.from('profiles').update(cambios).eq('id', id);
    if (error) throw error;
    toast('Permisos actualizados');
  } catch (e) {
    toast(e.message || 'No se pudo guardar');
    deshacer?.();
    pintar();
  }
}

function cambiarPerm(id, tab, valor) {
  const u = usuarios.find(x => x.id === id);
  if (!u) return;
  const antes = { ...(u.perms || {}) };
  u.perms = { ...antes, [tab]: valor };
  guardar(id, { perms: u.perms }, () => { u.perms = antes; });
}

function alternar(id, campo) {
  const u = usuarios.find(x => x.id === id);
  if (!u) return;

  const nombre = u.nombre || u.email;
  if (campo === 'admin' && !u.is_admin &&
      !confirm(`${nombre} podrá ver todas las secciones y cambiar los permisos de los demás. ¿Seguro?`)) return;

  const antes = u[campo === 'admin' ? 'is_admin' : 'activo'];
  const clave = campo === 'admin' ? 'is_admin' : 'activo';
  u[clave] = !antes;
  pintar();
  guardar(id, { [clave]: u[clave] }, () => { u[clave] = antes; });
}
