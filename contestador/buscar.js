// Busca en los feeds de Promodescuentos lo que preguntan ("televisores", "freidora", "ps5").
// Sin dependencias: lo usan el worker (index.js) y las pruebas (buscar.test.mjs).

export const FEEDS = [
  'https://www.promodescuentos.com/rss/tendencias', // con grados
  'https://www.promodescuentos.com/rss/todas', // recién publicadas, sin grados
];

// Palabras que la familia puede usar y lo que de verdad dicen los títulos.
const SINONIMOS = {
  televisor: ['pantalla', 'tv', 'smart tv', 'television', 'televisor'],
  television: ['pantalla', 'tv', 'smart tv', 'television', 'televisor'],
  tele: ['pantalla', 'tv', 'smart tv', 'television', 'televisor'],
  pantalla: ['pantalla', 'tv', 'smart tv', 'television', 'televisor'],
  tv: ['pantalla', 'tv', 'smart tv', 'television', 'televisor'],
  refri: ['refrigerador', 'refri'],
  refrigerador: ['refrigerador', 'refri'],
  celular: ['celular', 'smartphone', 'iphone', 'galaxy', 'xiaomi', 'motorola'],
  telefono: ['celular', 'smartphone', 'iphone', 'galaxy', 'xiaomi', 'motorola'],
  compu: ['laptop', 'computadora', 'macbook'],
  computadora: ['laptop', 'computadora', 'macbook'],
  laptop: ['laptop', 'computadora', 'macbook'],
  audifono: ['audifonos', 'airpods', 'earbuds'],
  consola: ['ps5', 'playstation', 'nintendo switch', 'switch 2', 'xbox'],
  playstation: ['ps5', 'playstation'],
  switch: ['nintendo switch', 'switch 2'],
  control: ['control', 'mando', 'gamepad', 'controller'],
  mando: ['control', 'mando', 'gamepad', 'controller'],
  bocina: ['bocina', 'altavoz', 'parlante', 'speaker'],
  '4k': ['4k', 'uhd'],
  taladro: ['taladro', 'rotomartillo'],
};
const TV = SINONIMOS.tv;
const TORNAMESA = ['tornamesa', 'tocadiscos', 'turntable', 'reproductor de vinil', 'reproductor de vinilo', 'reproductor de discos'];
const MINI = ['minicomponente', 'mini componente', 'microcomponente', 'micro componente', 'equipo de sonido', 'sistema de audio'];
const TEATRO = ['home theater', 'home theatre', 'teatro en casa', 'barra de sonido', 'soundbar'];
// Frases de varias palabras que son una sola cosa ("reproductor vinil" = tornamesa). Se buscan antes que las palabras sueltas.
const FRASES = {
  'xbox one series x': ['xbox series x', 'series x'],
  'xbox series x': ['xbox series x', 'series x'],
  'xbox series s': ['xbox series s', 'series s'],
  'smart tv': TV,
  'reproductor de vinil': TORNAMESA,
  'reproductor de vinilos': TORNAMESA,
  'reproductor vinil': TORNAMESA,
  'reproductor de discos': TORNAMESA,
  tornamesa: TORNAMESA,
  tocadiscos: TORNAMESA,
  minicomponente: MINI,
  'mini componente': MINI,
  'micro componente': MINI,
  'equipo de sonido': MINI,
  'bocina home theater': TEATRO,
  'bocinas home theater': TEATRO,
  'home theater': TEATRO,
  'teatro en casa': TEATRO,
  'barra de sonido': TEATRO,
};
const FRASES_RE = Object.keys(FRASES).sort((a, b) => b.length - a.length)
  .map((f) => [new RegExp(`(?<![a-z0-9])${f.replace(/ /g, '\\s*')}(?![a-z0-9])`), FRASES[f]]);
const RELLENO = new Set(['de', 'la', 'el', 'los', 'las', 'un', 'una', 'para', 'con', 'en', 'y', 'o', 'ofertas',
  'oferta', 'mejores', 'mejor', 'buenas', 'busca', 'buscar', 'quiero', 'hay', 'algo', 'barato', 'baratos', 'me', 'mandas']);
export const EXCLUIR = ['funda', 'mica', 'protector', 'soporte', 'repuesto', 'accesorio', 'accesorios', 'cable'];

export function normalize(text) {
  return (text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function singular(word) {
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

export function wordRe(word) {
  const w = normalize(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/(\d)([a-z])/g, '$1\\s*$2').replace(/ /g, '\\s*');
  return new RegExp(`(?<![a-z0-9])${w}(?:es|s)?(?![a-z0-9])`);
}

// ¿Es el nombre de una cosa que conocemos? ("para tv" es una cosa; "para papá", una persona).
export function esCosa(word) {
  const w = normalize(word);
  return Boolean(SINONIMOS[w] || SINONIMOS[singular(w)] || Object.keys(FRASES).some((f) => f.split(' ')[0] === w));
}

// "las mejores televisores" ->[["pantalla","tv",…]] : cada grupo debe aparecer (uno de sus sinónimos).
export function terms(question) {
  let s = normalize(question).replace(/[^a-z0-9 ]+/g, ' ').split(' ').map(corregir).join(' ');
  const groups = [];
  for (const [re, group] of FRASES_RE) {
    if (re.test(s)) {
      groups.push(group);
      s = s.replace(re, ' ');
    }
  }
  const words = s.split(' ').filter((w) => w && !RELLENO.has(w));
  return groups.concat(words.map((w) => SINONIMOS[w] || SINONIMOS[singular(w)] || [singular(w)]));
}

// Errores de dedo en una palabra conocida: una letra de más, de menos, cambiada o dos letras volteadas
// ("contol" -> "control", "minicmoponente" -> "minicomponente"). Palabras de 5 letras o más.
const CONOCIDAS = [...new Set([...Object.keys(SINONIMOS), ...Object.keys(FRASES).flatMap((f) => f.split(' '))])]
  .filter((k) => k.length >= 5);
function casiIgual(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i += 1;
  if (a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i)) return true;
  return a.length === b.length && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
}
export function corregir(w) {
  if (w.length < 5 || CONOCIDAS.includes(w) || CONOCIDAS.includes(singular(w))) return w;
  return CONOCIDAS.find((k) => casiIgual(w, k)) || CONOCIDAS.find((k) => casiIgual(singular(w), k)) || w;
}

const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

export function parse(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const link = decode((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
    const id = (link.match(/-(\d+)\/?$/) || [])[1];
    if (!id) continue;
    let title = decode((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    let grados = null;
    const g = title.match(/^\s*(-?\d[\d,.]*)\s*°\s*-\s*/);
    if (g) {
      grados = parseInt(g[1].replace(/[,.]/g, ''), 10);
      title = title.slice(g[0].length);
    }
    const merchant = it.match(/<pepper:merchant([^>]*)\/?>/);
    const attr = (name) => (merchant && (merchant[1].match(new RegExp(`${name}="([^"]*)"`)) || [])[1]) || null;
    const price = attr('price');
    items.push({
      id, link, title: decode(title).slice(0, 120), grados,
      tienda: attr('name') ? decode(attr('name')) : null,
      precio: price ? parseFloat(price.replace(/[^\d.]/g, '')) || null : null,
    });
  }
  return items;
}

export function merge(lists) {
  const out = new Map();
  for (const list of lists) {
    for (const o of list) {
      const prev = out.get(o.id);
      if (!prev) out.set(o.id, { ...o });
      else if (o.grados !== null && (prev.grados ?? -1e9) < o.grados) prev.grados = o.grados;
    }
  }
  return [...out.values()];
}

export function search(offers, question, limit = 5) {
  const groups = terms(question);
  if (!groups.length) return [];
  const found = offers.filter((o) => {
    const t = normalize(o.title);
    if (EXCLUIR.some((x) => wordRe(x).test(t))) return false;
    return groups.every((g) => g.some((w) => wordRe(w).test(t)));
  });
  found.sort((a, b) => (b.grados ?? -1) - (a.grados ?? -1));
  return found.slice(0, limit);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (v) => `$${v.toLocaleString('en-US', { maximumFractionDigits: v % 1 ? 2 : 0 })}`;

export function keepa(o) {
  const q = o.title.replace(/^[^:]{1,25}:\s*/, '').replace(/\([^)]*\)|\|.*$/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
  return `https://keepa.com/#!search/11-${encodeURIComponent(q)}`;
}

export function formatLines(results) {
  return results.map((o, i) => {
    const parts = [o.precio ? `<b>${money(o.precio)}</b>` : 'precio en la página'];
    if (o.tienda) parts.push(`🏬 ${esc(o.tienda)}`);
    parts.push(o.grados !== null ? `🔥 ${o.grados}°` : '🆕 nueva');
    let line = `${i + 1}. <a href="${esc(o.link)}">${esc(o.title)}</a>\n    ${parts.join(' · ')}`;
    if ((o.tienda || '').toLowerCase().includes('amazon')) line += ` · <a href="${esc(keepa(o))}">📈 Keepa</a>`;
    return line;
  }).join('\n\n');
}

export function answer(question, results) {
  const q = esc(question.trim().slice(0, 60));
  if (!results.length) {
    return `🔎 Ahorita no hay ofertas de <b>${q}</b> en Promodescuentos (busco entre las ~60 más recientes).\n` +
      `Si la quieres vigilar, apúntala: <b>/quiero ${q}</b> (puedes añadir "de 5000 a 9000" o "hasta 9000") y te aviso en cuanto salga.`;
  }
  return `🔎 <b>Lo mejor de ${q} ahorita</b> (por grados de la comunidad)\n\n${formatLines(results)}\n\n` +
    '<i>En Amazon revisa Keepa; si es caro, compara en Profeco: https://qqp.profeco.gob.mx/</i>';
}
