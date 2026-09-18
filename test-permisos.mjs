/* Comprueba las dos decisiones que sí tienen miga: quién ve qué, y qué copia
   de los datos gana cuando la del teléfono y la de la nube no coinciden.

   Correr:  node test-permisos.mjs
*/

import assert from 'node:assert/strict';

// auth.js se engancha al evento "online" del navegador nada más cargarse.
globalThis.addEventListener = () => {};

const { puedeVer, elegirCopia } = await import('./js/auth.js');

/* ---------- Permisos ---------- */

const basico = { is_admin: false, activo: true, perms: { combo: true, remesas: false } };

assert.equal(puedeVer(basico, 'combo'), true, 'lo marcado se ve');
assert.equal(puedeVer(basico, 'remesas'), false, 'lo desmarcado no se ve');
assert.equal(puedeVer(basico, 'trading'), false, 'lo que ni figura, tampoco');

const admin = { is_admin: true, activo: true, perms: {} };
assert.equal(puedeVer(admin, 'remesas'), true, 'el admin lo ve todo aunque no tenga nada marcado');

const suspendido = { is_admin: true, activo: false, perms: { combo: true } };
assert.equal(puedeVer(suspendido, 'combo'), false, 'un desactivado no ve nada, ni siendo admin');

assert.equal(puedeVer(null, 'remesas'), true, 'sin cuentas (modo local) no se esconde nada');

// El caso feo: perms manipulado desde la consola con valores que no son true.
for (const basura of ['true', 1, {}, [], 'si']) {
  assert.equal(puedeVer({ is_admin: false, activo: true, perms: { remesas: basura } }, 'remesas'),
    false, 'solo el true de verdad abre una seccion');
}

/* ---------- Qué copia gana ---------- */

const viejo = { _ts: '2026-01-01T10:00:00.000Z', marca: 'local' };
const nuevo = { _ts: '2026-06-01T10:00:00.000Z', marca: 'nube' };

assert.equal(elegirCopia(viejo, nuevo).marca, 'nube', 'gana la mas nueva');
assert.equal(elegirCopia(nuevo, viejo).marca, 'nube', 'aunque la nueva sea la del telefono');
assert.equal(elegirCopia(viejo, null).marca, 'local', 'sin nube, la del telefono');
assert.equal(elegirCopia(null, nuevo).marca, 'nube', 'telefono en blanco, se baja la nube');
assert.equal(elegirCopia(null, null), undefined, 'no hay nada en ningun lado');

// Empate y fechas rotas: no se pisa lo del telefono sin motivo.
assert.equal(elegirCopia({ _ts: viejo._ts, marca: 'local' }, viejo).marca, 'local', 'empate: se queda lo local');
assert.equal(elegirCopia({ marca: 'local' }, { marca: 'nube' }).marca, 'local', 'sin fechas: se queda lo local');
assert.equal(elegirCopia({ marca: 'local' }, nuevo).marca, 'nube', 'local sin fecha pierde contra una fecha buena');

console.log('OK — permisos y eleccion de copia');
