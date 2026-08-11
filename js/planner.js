/* Calculadora de combo posible: costo por producto + margen deseado -> precio de venta sugerido */

import { $, state, newId, num, usd, pct, esc, qtyFmt, unitFmt, toast, save } from './core.js';
import { copiar } from './combo.js';

let onChanged = () => {};
let tbody;

/* ============================================================
   Cálculos
   ============================================================ */

function calcRow(it) {
  const rate = state.planner.rate > 0 ? state.planner.rate : 0;
  const unitCostUsd = it.costCur === 'USD' ? it.cost : (rate ? it.cost / rate : 0);
  const suggestedUnit = unitCostUsd * (1 + state.planner.marginPct / 100);
  const costUsd = it.qty * unitCostUsd;
  const saleUsd = it.qty * suggestedUnit;
  return { unitCostUsd, suggestedUnit, costUsd, saleUsd, profit: saleUsd - costUsd };
}

function totals() {
  const t = { costUsd: 0, saleUsd: 0, profit: 0 };
  for (const it of state.planner.items) {
    const r = calcRow(it);
    t.costUsd += r.costUsd; t.saleUsd += r.saleUsd; t.profit += r.profit;
  }
  t.margin = t.costUsd > 0 ? (t.profit / t.costUsd) * 100 : null;
  return t;
}

/* ============================================================
   Render
   ============================================================ */

function rowHTML(it) {
  const r = calcRow(it);
  return `<tr data-id="${it.id}">
    <td class="c-name"><input class="cell-input name" data-f="name" value="${esc(it.name)}" placeholder="Producto"></td>
    <td class="c-qty c-num" data-label="Cantidad"><input class="cell-input num" data-f="qty" inputmode="decimal" value="${qtyFmt(it.qty)}"></td>
    <td class="c-unit" data-label="Unidad"><input class="cell-input cell-unit" data-f="unit" list="units" value="${esc(it.unit)}"></td>
    <td class="c-cost c-num" data-label="Costo c/u">
      <div class="cost-wrap">
        <button type="button" class="cur-btn ${it.costCur === 'USD' ? 'is-usd' : ''}" data-act="cur">${it.costCur}</button>
        <input class="cell-input num" data-f="cost" inputmode="decimal" value="${it.cost ? qtyFmt(it.cost) : ''}" placeholder="0">
      </div>
    </td>
    <td class="c-sale c-num" data-label="Venta sugerida c/u"><span class="calc" data-o="suggestedUnit">${usd(r.suggestedUnit)}</span></td>
    <td class="c-costusd c-num" data-label="Costo USD"><span class="calc muted" data-o="costUsd">${usd(r.costUsd)}</span></td>
    <td class="c-saleusd c-num" data-label="Venta sugerida"><span class="calc" data-o="saleUsd">${usd(r.saleUsd)}</span></td>
    <td class="c-profit c-num" data-label="Ganancia"><span class="calc pos" data-o="profit">${usd(r.profit)}</span></td>
    <td class="c-del"><button class="del" data-act="del" aria-label="Eliminar">✕</button></td>
  </tr>`;
}

export function renderPlanner() {
  const items = state.planner.items;
  tbody.innerHTML = items.map(rowHTML).join('');
  $('#pEmpty').hidden = items.length > 0;
  $('#pTbl').hidden = items.length === 0;
  renderTotals();
}

function paintRow(it) {
  const tr = tbody.querySelector(`tr[data-id="${it.id}"]`);
  if (!tr) return;
  const r = calcRow(it);
  tr.querySelector('[data-o="suggestedUnit"]').textContent = usd(r.suggestedUnit);
  tr.querySelector('[data-o="costUsd"]').textContent = usd(r.costUsd);
  tr.querySelector('[data-o="saleUsd"]').textContent = usd(r.saleUsd);
  tr.querySelector('[data-o="profit"]').textContent = usd(r.profit);
}

function renderTotals() {
  const t = totals();
  $('#pCostoTotal').textContent = usd(t.costUsd);
  $('#pVentaTotal').textContent = usd(t.saleUsd);
  $('#pGananciaTotal').textContent = usd(t.profit);
  $('#pGananciaTotal').className = 'stat-value ' + (t.profit > 0 ? 'pos' : t.profit < 0 ? 'neg' : '');
  $('#pMargenReal').textContent = t.margin === null ? '—' : pct(t.margin);
  save();
}

function repintarTodo() {
  state.planner.items.forEach(paintRow);
  renderTotals();
}

/* ============================================================
   Resumen para WhatsApp
   ============================================================ */

function summaryText() {
  const t = totals();
  const L = ['*Combo posible*'];
  L.push(`Margen: ${qtyFmt(state.planner.marginPct)}% · Tasa: ${qtyFmt(state.planner.rate)} CUP = 1 USD`);
  L.push('');
  for (const it of state.planner.items) {
    if (!it.name.trim()) continue;
    const r = calcRow(it);
    L.push(`• ${it.name} — ${qtyFmt(it.qty)} ${unitFmt(it.unit, it.qty)} — ${usd(r.saleUsd)}`);
  }
  L.push('');
  L.push(`Precio total sugerido: ${usd(t.saleUsd)}`);
  return L.join('\n');
}

/* ============================================================
   Conexión con el DOM
   ============================================================ */

export function initPlanner(notify) {
  onChanged = notify || (() => {});
  tbody = $('#pTbody');

  $('#pRate').value = qtyFmt(state.planner.rate);
  $('#pMargin').value = qtyFmt(state.planner.marginPct);

  $('#pRate').addEventListener('input', e => {
    state.planner.rate = num(e.target.value);
    repintarTodo();
  });
  $('#pMargin').addEventListener('input', e => {
    state.planner.marginPct = num(e.target.value);
    repintarTodo();
  });

  const itemDe = el => state.planner.items.find(i => i.id === el.closest('tr').dataset.id);

  tbody.addEventListener('input', e => {
    const f = e.target.dataset.f;
    if (!f) return;
    const it = itemDe(e.target);
    if (!it) return;
    it[f] = (f === 'name' || f === 'unit') ? e.target.value : num(e.target.value);
    paintRow(it);
    renderTotals();
  });

  tbody.addEventListener('click', e => {
    const act = e.target.dataset.act;
    if (!act) return;
    if (act === 'del') {
      const tr = e.target.closest('tr');
      state.planner.items = state.planner.items.filter(i => i.id !== tr.dataset.id);
      renderPlanner();
      toast('Producto eliminado');
    }
    if (act === 'cur') {
      const it = itemDe(e.target);
      if (!it) return;
      it.costCur = it.costCur === 'CUP' ? 'USD' : 'CUP';
      e.target.textContent = it.costCur;
      e.target.classList.toggle('is-usd', it.costCur === 'USD');
      paintRow(it);
      renderTotals();
    }
  });

  $('#btnPAdd').addEventListener('click', () => {
    state.planner.items.push({ id: newId(), name: '', qty: 1, unit: 'u', cost: 0, costCur: 'CUP' });
    renderPlanner();
    const last = tbody.querySelector('tr:last-child [data-f="name"]');
    last?.focus();
    last?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  $('#btnPClear').addEventListener('click', () => {
    if (state.planner.items.length && !confirm('¿Vaciar los productos del planificador?')) return;
    state.planner.items = [];
    renderPlanner();
    toast('Planificador vacío');
  });

  $('#btnPCopy').addEventListener('click', () => {
    if (!state.planner.items.some(i => i.name.trim())) { toast('Añade productos primero'); return; }
    copiar(summaryText(), 'Resumen copiado');
  });
}
