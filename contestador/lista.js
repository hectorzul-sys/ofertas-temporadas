// Lista de compras de la familia, apuntada desde Telegram: "/quiero televisor 4k de 5000 a 9000 sin curvo para papá".
// Aquí solo se entiende el texto y se compara con una oferta; guardar en Cloudflare (KV) lo hace index.js.
// El bot de Python (src/filtro.py) usa los mismos campos: grupos, min, max, excluir, para.
import { EXCLUIR, corregir, esCosa, normalize, terms, wordRe } from './buscar.js';

// Lo que casi nunca es "la cosa" sino un accesorio de ella. Se quita si la persona lo pide ("/quiero cable hdmi").
const ACCESORIOS = [...EXCLUIR, 'estuche', 'skin', 'base de carga', 'cargador', 'adaptador', 'control remoto'];
const NUM = String.raw`\$?\s*(\d[\d,.]*)\s*(mil|k)?(?![a-z0-9])`;
const RANGO = [
  new RegExp(String.raw`(?:^|\s)(?:de|entre|desde)\s+${NUM}\s*(?:pesos\s+)?(?:a|y|hasta|-)\s+${NUM}(?:\s+pesos)?`),
  new RegExp(String.raw`(?:^|\s)\$\s*(\d[\d,.]*)\s*(mil|k)?\s*(?:a|-)\s*${NUM}(?:\s+pesos)?`),
];
const MAXIMO = new RegExp(String.raw`(?:^|\s)(?:hasta|menos de|m[aá]ximo|max|tope|no m[aá]s de|abajo de|debajo de)\s+${NUM}(?:\s+pesos)?`);
const MINIMO = new RegExp(String.raw`(?:^|\s)(?:desde|m[aá]s de|arriba de|m[ií]nimo|min)\s+${NUM}(?:\s+pesos)?`);
const SOLO = new RegExp(String.raw`(?:^|\s)\$\s*(\d[\d,.]*)\s*(mil|k)?(?![a-z0-9])(?:\s+pesos)?`);
const PARA = /(?:^|\s)para\s+((?:mi\s+|el\s+|la\s+)?[\p{L}]+(?:\s+[\p{L}]+){0,2})\s*$/u;
const VERBO = /^\/?(?:quiero|quisiera|busco|ap[uú]nta(?:me)?|agrega|anota)(?:@\w+)?\s+/;

function money(digits, mult) {
  let d = digits.replace(/[.,]$/, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(d)) d = d.replace(/\./g, ''); // 9.500 = nueve mil quinientos
  let v = parseFloat(d.replace(/,/g, ''));
  if (Number.isNaN(v)) return null;
  if (mult) v *= 1000;
  return Math.round(v);
}

// -> {nombre, grupos, min, max, excluir, para} o null si no se entendió qué buscar.
export function parseWish(text) {
  let s = ` ${(text || '').toLowerCase().replace(/\s+/g, ' ').trim()} `;
  let min = null;
  let max = null;
  const cut = (m) => { s = s.replace(m[0], ' '); };
  let m;
  for (const re of RANGO) {
    if ((m = s.match(re))) {
      [min, max] = [money(m[1], m[2]), money(m[3], m[4])];
      cut(m);
      break;
    }
  }
  if (max === null && (m = s.match(MAXIMO))) { max = money(m[1], m[2]); cut(m); }
  if (min === null && (m = s.match(MINIMO))) { min = money(m[1], m[2]); cut(m); }
  if (max === null && (m = s.match(SOLO))) { max = money(m[1], m[2]); cut(m); }
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  s = s.replace(/[.!¡¿?]+/g, ' ').replace(/\s+/g, ' ').trim();
  let para = null;
  if ((m = s.match(PARA))) {
    const first = normalize(m[1]).replace(/^(mi|el|la)\s+/, '').split(' ')[0];
    if (!esCosa(first)) {
      para = m[1].trim();
      s = s.slice(0, m.index).trim();
    }
  }
  let sin = [];
  if ((m = s.match(/(?:^|\s)sin\s+(.+)$/))) {
    sin = m[1].split(/\s*,\s*|\s+y\s+|\s+ni\s+|\s+o\s+/).map((w) => normalize(w)).filter(Boolean);
    s = s.slice(0, m.index).trim();
  }
  s = s.replace(VERBO, '').replace(/^(?:un|una|unos|unas)\s+/, '').replace(/[,;:]+$/, '').trim();
  const grupos = terms(s);
  if (!grupos.length) return null;
  const excluir = excluirPara(grupos, sin);
  const nombre = s.split(' ').map((w) => (corregir(normalize(w)) !== normalize(w) ? corregir(normalize(w)) : w)).join(' ').slice(0, 60);
  return { nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1), grupos, min, max, excluir, para };
}

// Accesorios de siempre (salvo los que la persona pidió) más lo que dijo con "sin …" o lo que trae su categoría.
export function excluirPara(grupos, extra = []) {
  const pedido = grupos.flat().map(normalize);
  return [...new Set([...extra, ...ACCESORIOS.filter((a) => !pedido.some((w) => w.includes(a) || a.includes(w)))])];
}

export function matchWish(offer, item) {
  const t = normalize(offer.title || offer.titulo);
  const precio = offer.precio;
  if (item.max != null && (precio == null || precio > item.max)) return false;
  const low = item.min ?? item.piso;
  if (low != null && (precio == null || precio < low)) return false;
  if ((item.excluir || []).some((x) => wordRe(x).test(t))) return false;
  return item.grupos.every((g) => g.some((w) => wordRe(w).test(t)));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pesos = (v) => `$${v.toLocaleString('en-US')}`;

export function priceText(item) {
  if (item.min != null && item.max != null) return `de ${pesos(item.min)} a ${pesos(item.max)}`;
  if (item.max != null) return `hasta ${pesos(item.max)}`;
  if (item.min != null) return `desde ${pesos(item.min)}`;
  return 'a cualquier precio';
}

// "#3 Televisor 4k · de $5,000 a $9,000 · para papá" + cómo lo va a buscar, para que se pueda corregir.
export function describe(item) {
  const head = [`<b>#${item.n} ${esc(item.nombre)}</b>`, priceText(item)];
  if (item.para) head.push(`👤 para ${esc(item.para)}`);
  // Solo lo que la persona dijo con "sin …"; lo que excluye una categoría del cuestionario no se enseña.
  const sin = item.categoria ? [] : (item.excluir || []).filter((x) => !ACCESORIOS.includes(x));
  const lines = [head.join(' · '), `    🔎 busco: ${esc(item.grupos.map((g) => g.slice(0, 3).join('/')).join(' + '))}`];
  if (sin.length) lines.push(`    🚫 sin: ${esc(sin.join(', '))}`);
  return lines.join('\n');
}
