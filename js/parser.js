/* Analizador de listas de WhatsApp: separa cantidad, unidad y producto */

import { num, deacc } from './core.js';

export const UNITS = [
  [/^(lbs?|libras?)$/,                    'lb'],
  [/^(kgs?|kilos?|kilogramos?)$/,         'kg'],
  [/^(gr?|grs|gramos?)$/,                 'g'],
  [/^pomos?$/,                            'pomo'],
  [/^(pqtes?|pqts?|paqs?|pq|paquetes?)$/, 'paquete'],
  [/^(latas?|laticas?|latitas?)$/,        'lata'],
  [/^cajas?$/,                            'caja'],
  [/^(bolsas?|bolsitas?)$/,               'bolsa'],
  [/^(lts?|litros?)$/,                    'litro'],
  [/^(botellas?|botellitas?)$/,           'botella'],
  [/^(cartones?|carton)$/,                'cartón'],
  [/^sacos?$/,                            'saco'],
  [/^bandejas?$/,                         'bandeja'],
  [/^barras?$/,                           'barra'],
  [/^frascos?$/,                          'frasco'],
  [/^sobres?$/,                           'sobre'],
  [/^(rollos?)$/,                         'rollo'],
  [/^(uds?|und|un|u|unidad|unidades)$/,   'u']
];

const WORD_NUM = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  docena: 12, media: 0.5, medio: 0.5
};

// Abreviaturas típicas dentro del nombre
const ABBR = { d: 'de', f: 'frijol', fj: 'frijol', az: 'azúcar' };

const NOISE = /^(hola|buenas?|buenos|gracias|ok|dale|saludos|combo|lista|pedido|total|precio|nota|mensaje|hoy|aqui|aquí)\b/;

function unitOf(tok) {
  for (const [re, label] of UNITS) if (re.test(tok)) return label;
  return null;
}

function cleanLine(line) {
  return line
    // Prefijo de exportación de WhatsApp: [12/3/25, 10:04] Juan:
    .replace(/^\s*\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(:\d{2})?\s*([ap]\.?\s?m\.?)?\]?\s*-?\s*[^:]{0,40}:\s*/i, '')
    .replace(/^[\s>*•·▪◦\-–—+#]+/, '')
    .replace(/^\d+[).]\s+/, '')                // numeración "1) arroz"
    .replace(/[‎‏]/g, '')
    .trim();
}

function titleCase(s) {
  return s.replace(/^\s*([a-záéíóúñü])/i, (m, c) => c.toUpperCase());
}

function expandName(words) {
  return words
    .map(w => ABBR[deacc(w).toLowerCase()] ?? w)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Devuelve {qty, unit, name, raw, include} o null
export function parseLine(rawLine) {
  const raw = cleanLine(rawLine);
  if (!raw || !/[a-záéíóúñü]/i.test(raw)) return null;

  let toks = raw.split(/\s+/);
  let qty = null, unit = null;

  // "10lbs" pegado
  const glued = deacc(toks[0]).toLowerCase().match(/^(\d+(?:[.,]\d+)?)([a-z]+)$/);
  if (glued) toks.splice(0, 1, glued[1], glued[2]);

  const readQty = i => {
    const r = readQtyBase(i);
    if (!r) return null;
    // "media docena", "2 docenas" -> x12
    if (/^docenas?$/.test(deacc(toks[i + r.used] ?? '').toLowerCase())) {
      return { v: r.v * 12, used: r.used + 1 };
    }
    return r;
  };

  const readQtyBase = i => {
    const t = deacc(toks[i] ?? '').toLowerCase();
    if (/^\d+\/\d+$/.test(t)) return { v: num(t), used: 1 };
    if (/^\d+(?:[.,]\d+)?$/.test(t)) {
      const next = deacc(toks[i + 1] ?? '').toLowerCase();
      if (/^\d+\/\d+$/.test(next)) return { v: num(t) + num(next), used: 2 };
      return { v: num(t), used: 1 };
    }
    if (t in WORD_NUM) return { v: WORD_NUM[t], used: 1 };
    return null;
  };

  // Cantidad al inicio
  const head = readQty(0);
  if (head) {
    qty = head.v;
    toks = toks.slice(head.used);
  } else {
    // Cantidad al final: "arroz 10 lbs"
    const last = toks.length - 1;
    const maybeUnit = unitOf(deacc(toks[last] ?? '').toLowerCase());
    const qi = maybeUnit ? last - 1 : last;
    const tail = qi > 0 ? readQty(qi) : null;
    if (tail && qi + tail.used >= toks.length - (maybeUnit ? 1 : 0)) {
      qty = tail.v;
      unit = maybeUnit;
      toks = toks.slice(0, qi);
    }
  }

  // Unidad después de la cantidad
  if (!unit && toks.length) {
    const u = unitOf(deacc(toks[0]).toLowerCase());
    if (u && toks.length > 1) { unit = u; toks = toks.slice(1); }
    else if (u && toks.length === 1 && qty !== null) { unit = u; toks = []; }
  }

  // Conector "de/d/del" tras la unidad
  if (toks.length > 1 && /^(de|del|d)$/.test(deacc(toks[0]).toLowerCase())) toks = toks.slice(1);

  const name = titleCase(expandName(toks));
  if (!name) return null;

  const words = raw.split(/\s+/).length;
  const include = !(qty === null && (words > 7 || NOISE.test(deacc(raw).toLowerCase()) || /[:?]$/.test(raw)));

  return { qty: qty ?? 1, unit: unit || 'u', name, raw, include };
}

export function parseList(text) {
  return text.split(/\r?\n/).map(parseLine).filter(Boolean);
}
