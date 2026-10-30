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
};
const RELLENO = new Set(['de', 'la', 'el', 'los', 'las', 'un', 'una', 'para', 'con', 'en', 'y', 'o', 'ofertas',
  'oferta', 'mejores', 'mejor', 'buenas', 'busca', 'buscar', 'quiero', 'hay', 'algo', 'barato', 'baratos', 'me', 'mandas']);
const EXCLUIR = ['funda', 'mica', 'protector', 'soporte', 'repuesto', 'accesorio', 'accesorios', 'cable'];

export function normalize(text) {
  return (text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function singular(word) {
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function wordRe(word) {
  const w = normalize(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/(\d)([a-z])/g, '$1\\s*$2').replace(/ /g, '\\s*');
  return new RegExp(`(?<![a-z0-9])${w}(?:es|s)?(?![a-z0-9])`);
}

// "las mejores televisores" -> [["pantalla","tv",…]] : cada grupo debe aparecer (uno de sus sinónimos).
export function terms(question) {
  const words = normalize(question).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w && !RELLENO.has(w));
  return words.map((w) => SINONIMOS[w] || SINONIMOS[singular(w)] || [singular(w)]);
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

export function answer(question, results) {
  const q = esc(question.trim().slice(0, 60));
  if (!results.length) {
    return `🔎 Ahorita no hay ofertas de <b>${q}</b> en Promodescuentos (busco entre las ~60 más recientes).\n` +
      'Si la quieres vigilar, dile a Claude que la agregue a la lista de compras con tu precio máximo y el bot te avisa en cuanto salga.';
  }
  const lines = results.map((o, i) => {
    const parts = [o.precio ? `<b>${money(o.precio)}</b>` : 'precio en la página'];
    if (o.tienda) parts.push(`🏬 ${esc(o.tienda)}`);
    parts.push(o.grados !== null ? `🔥 ${o.grados}°` : '🆕 nueva');
    let line = `${i + 1}. <a href="${esc(o.link)}">${esc(o.title)}</a>\n    ${parts.join(' · ')}`;
    if ((o.tienda || '').toLowerCase().includes('amazon')) line += ` · <a href="${esc(keepa(o))}">📈 Keepa</a>`;
    return line;
  });
  return `🔎 <b>Lo mejor de ${q} ahorita</b> (por grados de la comunidad)\n\n${lines.join('\n\n')}\n\n` +
    '<i>En Amazon revisa Keepa; si es caro, compara en Profeco: https://qqp.profeco.gob.mx/</i>';
}
