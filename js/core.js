/* Estado compartido, formato de números, guardado y avisos */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const STORE = 'calccombos.v2';
const STORE_V1 = 'calccombos.v1';

export const state = {
  rate: 440,
  tab: 'combo',
  current: { name: '', combos: 1, items: [], fromId: null },
  saved: [],    // combos guardados con fecha
  remesas: [],
  trades: [],   // compra/venta de USD
  planner: { rate: 440, marginPct: 40, items: [] }   // borrador único de "combo posible"
};

let seq = 1;
export const newId = (p = 'i') => p + (seq++) + '-' + Math.random().toString(36).slice(2, 7);

/* ---------- Números ---------- */

// Acepta "1200", "1.5", "1,5", "1.234,56", "1/2", "" -> número o 0
export function num(v) {
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

// El signo va delante del símbolo: -$5,00 y no $-5,00
export const usd = n => {
  const v = Math.round(n * 100) / 100;
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export const cup = n => Math.round(n).toLocaleString('es-ES') + ' CUP';
export const qtyFmt = n => (Math.round(n * 1000) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 3, useGrouping: false });
export const pct = n => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const deacc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// "2 lata" -> "2 latas" (las abreviaturas no se pluralizan)
const ABBREV_UNITS = new Set(['lb', 'kg', 'g', 'u']);
export function unitFmt(unit, qty) {
  const u = String(unit || '').trim();
  if (!u || qty === 1 || ABBREV_UNITS.has(u) || /s$/i.test(u)) return u;
  return /ón$/i.test(u) ? u.replace(/ón$/i, 'ones') : u + 's';
}

/* ---------- Fechas ---------- */

export const nowIso = () => new Date().toISOString();

export function fechaHora(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function fechaCorta(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// "2026-08" -> "agosto 2026"
export function mesLargo(clave) {
  const [y, m] = clave.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  const s = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const claveMes = iso => String(iso).slice(0, 7);   // "2026-08-06T…" -> "2026-08"
export const mesActual = () => nowIso().slice(0, 7);

/* ---------- Avisos ---------- */

let toastT;
export function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- Guardado ---------- */

let saveT;
export function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        rate: state.rate,
        current: state.current,
        saved: state.saved,
        remesas: state.remesas,
        trades: state.trades,
        planner: state.planner
      }));
    } catch {}
  }, 250);
}

function normItem(i) {
  // v1 guardaba el costo siempre en CUP, en el campo costCup
  const cost = i.cost !== undefined ? num(i.cost) : num(i.costCup);
  return {
    id: newId(),
    name: i.name || '',
    qty: num(i.qty),
    unit: i.unit || 'u',
    cost,
    costCur: i.costCur === 'USD' ? 'USD' : 'CUP',
    saleUsd: num(i.saleUsd),
    ok: !!i.ok
  };
}

// Compra/venta: cada operación es independiente (tipo compra o venta).
// La primera versión de esta pestaña guardaba un lote emparejado
// {monto, tasaCompra, tasaVenta, status}; se separa en sus operaciones reales.
function migrarTrade(t) {
  if (t.tipo) {
    return [{
      id: t.id || newId('t'),
      createdAt: t.createdAt || nowIso(),
      tipo: t.tipo === 'venta' ? 'venta' : 'compra',
      monto: num(t.monto),
      tasa: num(t.tasa),
      nota: t.nota || ''
    }];
  }
  const out = [{
    id: newId('t'),
    createdAt: t.createdAt || nowIso(),
    tipo: 'compra',
    monto: num(t.monto),
    tasa: num(t.tasaCompra),
    nota: t.nota || ''
  }];
  if (t.status === 'vendida' && num(t.tasaVenta) > 0) {
    out.push({
      id: newId('t'),
      createdAt: t.soldAt || t.createdAt || nowIso(),
      tipo: 'venta',
      monto: num(t.monto),
      tasa: num(t.tasaVenta),
      nota: t.nota || ''
    });
  }
  return out;
}

export function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch {}

  if (!d) {
    // Migración desde la primera versión: un solo combo suelto, sin historial
    let v1 = null;
    try { v1 = JSON.parse(localStorage.getItem(STORE_V1) || 'null'); } catch {}
    if (v1) {
      d = {
        rate: v1.rate,
        current: { name: v1.name || '', combos: v1.combos, items: v1.items || [] },
        saved: [], remesas: []
      };
    }
  }
  if (!d) return;

  state.rate = num(d.rate) || 440;
  const c = d.current || {};
  state.current = {
    name: c.name || '',
    combos: Math.max(1, Math.round(num(c.combos)) || 1),
    items: (c.items || []).map(normItem),
    fromId: c.fromId || null
  };
  state.saved = (d.saved || []).map(s => ({
    id: s.id || newId('c'),
    name: s.name || 'Combo sin nombre',
    savedAt: s.savedAt || nowIso(),
    rate: num(s.rate) || 440,
    combos: Math.max(1, Math.round(num(s.combos)) || 1),
    items: (s.items || []).map(normItem)
  }));
  state.remesas = (d.remesas || []).map(r => ({
    id: r.id || newId('r'),
    createdAt: r.createdAt || nowIso(),
    paidAt: r.paidAt || null,
    status: r.status === 'pagada' ? 'pagada' : 'pendiente',
    cliente: r.cliente || '',
    destinatario: r.destinatario || '',
    telefono: r.telefono || '',
    nota: r.nota || '',
    zelle: num(r.zelle),
    efectivo: num(r.efectivo),
    entregado: num(r.entregado),
    entregadoCur: r.entregadoCur === 'CUP' ? 'CUP' : 'USD',
    tasa: num(r.tasa)
  }));

  state.trades = (d.trades || []).flatMap(migrarTrade);

  const p = d.planner || {};
  state.planner = {
    rate: num(p.rate) || 440,
    marginPct: num(p.marginPct) || 0,
    items: (p.items || []).map(i => ({
      id: newId(),
      name: i.name || '',
      qty: num(i.qty) || 1,
      cost: num(i.cost),
      costCur: i.costCur === 'USD' ? 'USD' : 'CUP'
    }))
  };
}
