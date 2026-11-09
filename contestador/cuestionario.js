// Cuestionario con botones de /quiero: categoría → sus preguntas (se pueden marcar varias) → precio → apuntado.
// Solo arma textos, botones y la cosa final; hablar con Telegram y guardar lo apuntado lo hace index.js.
// No guarda nada entre toques: cada botón lleva dentro lo elegido hasta ahora (así no se pierde un paso aunque
// toquen rápido, y no gasta escrituras de Cloudflare). callback_data (máx. 64 bytes):
//   q:<acción>:<arg>:<categoría>:<paso>:<marcas>   p. ej. "q:t:3:tv:1:12.1.0"
//   acciones: c categoría · t marcar opción · n siguiente · b atrás · p precio (-1 = sin límite) · o otra cosa · x cancelar
//   marcas: una por pregunta, en base 36; el bit j encendido = opción j marcada.
import { CATEGORIAS, categoria } from './catalogo.js';
import { excluirPara } from './lista.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pesos = (v) => `$${v.toLocaleString('en-US')}`;
const rows = (buttons, per) => buttons.reduce((out, b, i) => (i % per ? out[out.length - 1].push(b) : out.push([b]), out), []);

const VACIO = { cat: null, paso: 0, sel: {} };

export function encode(s) {
  const cat = s.cat && categoria(s.cat);
  const marks = cat ? cat.preguntas.map((_, i) => (s.sel[i] || []).reduce((m, j) => m | (1 << j), 0).toString(36)).join('.') : '';
  return `${s.cat || '-'}:${s.paso || 0}:${marks}`;
}

export function decode(data) {
  const [, action = '', arg = '', catId = '-', paso = '0', marks = ''] = (data || '').split(':');
  const cat = categoria(catId);
  const sel = {};
  if (cat) {
    marks.split('.').forEach((m, i) => {
      const v = parseInt(m || '0', 36) || 0;
      const on = cat.preguntas[i] ? cat.preguntas[i].opciones.map((_, j) => j).filter((j) => v & (1 << j)) : [];
      if (on.length) sel[i] = on;
    });
  }
  const state = cat ? { cat: cat.id, paso: Math.max(0, Math.min(Number(paso) || 0, cat.preguntas.length)), sel } : { ...VACIO };
  return { action, arg, state };
}

const btn = (text, action, arg, state) => ({ text, callback_data: `q:${action}:${arg ?? ''}:${encode(state)}` });

export function priceLabel([low, high]) {
  if (low == null) return `Hasta ${pesos(high)}`;
  if (high == null) return `Más de ${pesos(low)}`;
  return `${pesos(low)} – ${pesos(high)}`;
}

const chosen = (cat, sel, i) => (sel[i] || []).map((j) => cat.preguntas[i].opciones[j][0]);

function resumen(cat, sel) {
  const parts = cat.preguntas.map((_, i) => chosen(cat, sel, i).join(' o ')).filter(Boolean);
  return [cat.nombre, ...parts].join(' · ');
}

export function inicio() {
  return pantalla(VACIO);
}

export function pantalla(state) {
  const cancelar = btn('✖️ Cancelar', 'x', '', state);
  if (!state.cat) {
    return {
      text: '🛒 <b>¿Qué buscas?</b>\nToca una categoría. Si no está, toca <b>Otra cosa</b> y me lo escribes.',
      keyboard: [...rows(CATEGORIAS.map((c) => btn(c.boton, 'c', c.id, VACIO)), 2), [btn('✏️ Otra cosa', 'o', '', VACIO), cancelar]],
    };
  }
  const cat = categoria(state.cat);
  const total = cat.preguntas.length + 1;
  const head = `${cat.boton} · paso ${state.paso + 1} de ${total}`;
  const hasta = resumen(cat, state.sel);
  const llevas = hasta !== cat.nombre ? `\n🧾 Llevas: <i>${esc(hasta)}</i>` : '';
  const atras = btn('⬅️ Atrás', 'b', '', state);
  if (state.paso >= cat.preguntas.length) {
    const precios = cat.precios.map((p, i) => btn(priceLabel(p), 'p', i, state));
    return {
      text: `${head}${llevas}\n\n<b>¿Cuánto quieres pagar?</b>\n💡 Un rango ayuda a que solo te lleguen las que te interesan.`,
      keyboard: [...rows(precios, 2), [btn('Sin límite', 'p', -1, state)], [atras, cancelar]],
    };
  }
  const q = cat.preguntas[state.paso];
  const sel = state.sel[state.paso] || [];
  const opciones = q.opciones.map(([label], j) => btn(`${sel.includes(j) ? '✅ ' : ''}${label}`, 't', j, state));
  const nav = [atras];
  if (!q.obligatoria || sel.length) nav.push(btn(sel.length ? 'Siguiente ➡️' : 'Cualquiera ➡️', 'n', '', state));
  const how = q.unaSola ? '' : q.obligatoria ? '\n<i>Marca una o varias.</i>' : '\n<i>Marca una o varias, o toca "Cualquiera".</i>';
  return {
    text: `${head}${llevas}\n\n<b>${esc(q.texto)}</b>${how}${q.tip ? `\n💡 ${esc(q.tip)}` : ''}`,
    keyboard: [...rows(opciones, opciones.some((b) => b.text.length > 16) ? 2 : 3), nav, [cancelar]],
  };
}

// Aplica un toque. -> { state } para seguir, { item } al terminar, { cancelado } u { otra }.
export function tocar(data) {
  const { action, arg, state: s } = decode(data);
  if (action === 'x') return { cancelado: true };
  if (action === 'o') return { otra: true };
  if (action === 'c') return { state: categoria(arg) ? { cat: arg, paso: 0, sel: {} } : { ...VACIO } };
  const cat = s.cat && categoria(s.cat);
  if (!cat) return { state: { ...VACIO } };
  if (action === 'b') return { state: s.paso === 0 ? { ...VACIO } : { ...s, paso: s.paso - 1 } };
  if (action === 'n') {
    if (cat.preguntas[s.paso]?.obligatoria && !(s.sel[s.paso] || []).length) return { state: s };
    return { state: { ...s, paso: Math.min(s.paso + 1, cat.preguntas.length) } };
  }
  if (action === 't') {
    const q = cat.preguntas[s.paso];
    const j = Number(arg);
    if (!q || !q.opciones[j]) return { state: s };
    if (q.unaSola) return { state: { ...s, sel: { ...s.sel, [s.paso]: [j] }, paso: s.paso + 1 } };
    const cur = s.sel[s.paso] || [];
    const next = cur.includes(j) ? cur.filter((x) => x !== j) : [...cur, j].sort((a, b) => a - b);
    return { state: { ...s, sel: { ...s.sel, [s.paso]: next } } };
  }
  if (action === 'p') {
    if (s.paso < cat.preguntas.length) return { state: s }; // botón viejo de otro paso
    const i = Number(arg);
    return { item: armar(cat, s.sel, i >= 0 && cat.precios[i] ? cat.precios[i] : [null, null]) };
  }
  return { state: s };
}

// Lo elegido -> la misma forma que /quiero con texto (grupos, min, max, excluir), para el contestador y el bot.
export function armar(cat, sel, [low, high]) {
  const grupos = cat.base ? [cat.base] : [];
  cat.preguntas.forEach((q, i) => {
    const words = (sel[i] || []).flatMap((j) => q.opciones[j][1]);
    if (words.length) grupos.push([...new Set(words)]);
  });
  return {
    nombre: resumen(cat, sel).slice(0, 80),
    grupos,
    min: low,
    max: high,
    piso: cat.piso ?? null, // no se enseña: solo evita accesorios baratos cuando no eligen precio mínimo
    excluir: excluirPara(grupos, cat.excluir || []),
    para: null,
    categoria: cat.id,
  };
}
