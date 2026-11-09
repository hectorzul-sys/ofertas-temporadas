// Pruebas del cuestionario con botones: node --test contestador/cuestionario.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATEGORIAS } from './catalogo.js';
import { armar, decode, encode, inicio, pantalla, tocar } from './cuestionario.js';
import worker from './index.js';
import { describe, matchWish } from './lista.js';

const datos = (p) => p.keyboard.flat().map((b) => b.callback_data);
const boton = (p, texto) => p.keyboard.flat().find((b) => b.text.replace('✅ ', '') === texto)?.callback_data;
// Toca botones por su texto, empezando en /quiero, y devuelve el final.
function camino(...textos) {
  let p = inicio();
  let r;
  for (const t of textos) {
    const data = boton(p, t);
    assert.ok(data, `no encontré el botón "${t}" en: ${p.keyboard.flat().map((b) => b.text).join(' | ')}`);
    r = tocar(data);
    if (r.item) return r;
    p = pantalla(r.state);
  }
  return { ...r, pantalla: p };
}

test('todos los botones caben en Telegram (64 bytes), aun con todo marcado', () => {
  for (const cat of CATEGORIAS) {
    const sel = Object.fromEntries(cat.preguntas.map((q, i) => [i, q.opciones.map((_, j) => j)]));
    for (let paso = 0; paso <= cat.preguntas.length; paso += 1) {
      for (const d of datos(pantalla({ cat: cat.id, paso, sel }))) assert.ok(Buffer.byteLength(d) <= 64, `${cat.id}: ${d}`);
    }
    assert.deepEqual(decode(`q:n::${encode({ cat: cat.id, paso: 1, sel })}`).state.sel, sel);
  }
});

test('tele: LG o TCL, 4K, cualquier tamaño, de 5 a 9 mil', () => {
  const { item } = camino('📺 Tele', 'LG', 'TCL', 'Siguiente ➡️', '4K', 'Siguiente ➡️', 'Cualquiera ➡️', '$5,000 – $9,000');
  assert.equal(item.nombre, 'Tele · LG o TCL · 4K');
  assert.deepEqual([item.min, item.max], [5000, 9000]);
  assert.deepEqual(item.grupos.slice(1), [['lg', 'tcl'], ['4k', 'uhd']]);
  const m = (t, p) => matchWish({ title: t, precio: p }, item);
  assert.ok(m('Smart TV TCL 55" 4K Google TV', 7999));
  assert.ok(m('Pantalla LG 50 pulgadas UHD', 6999));
  assert.ok(!m('Pantalla Samsung 55 4K', 7999));     // otra marca
  assert.ok(!m('Pantalla TCL 32 HD', 5500));         // no 4K
  assert.ok(!m('Pantalla TCL 65 4K', 12999));        // se pasa
  assert.match(describe({ ...item, n: 1 }), /Tele · LG o TCL · 4K<\/b> · de \$5,000 a \$9,000/);
});

test('desmarcar, atrás y sin límite (con piso contra accesorios)', () => {
  const r = camino('📺 Tele', 'LG', 'LG', 'Cualquiera ➡️', 'OLED', '⬅️ Atrás');
  assert.match(r.pantalla.text, /¿Qué marca\?/);
  assert.match(r.pantalla.text, /Llevas: <i>Tele · OLED/); // lo del paso 2 se queda aunque regrese
  const { item } = camino('📺 Tele', 'Cualquiera ➡️', 'OLED', 'Siguiente ➡️', 'Cualquiera ➡️', 'Sin límite');
  assert.deepEqual([item.min, item.max, item.piso], [null, null, 2000]);
  assert.ok(matchWish({ title: 'Pantalla Sony OLED 65', precio: 32999 }, item));
  assert.ok(!matchWish({ title: 'Control remoto para pantalla OLED', precio: 299 }, item));
  assert.match(describe({ ...item, n: 2 }), /a cualquier precio/); // el piso no se enseña
});

test('consola: hay que elegir una; no confunde juegos ni controles', () => {
  let r = camino('🎮 Consola');
  assert.ok(!r.pantalla.keyboard.flat().some((b) => /Cualquiera|Siguiente/.test(b.text)));
  r = camino('🎮 Consola', 'Xbox Series X', 'Siguiente ➡️');
  assert.match(r.pantalla.text, /Cuánto quieres pagar/);
  const { item } = camino('🎮 Consola', 'Xbox Series X', 'PS5', 'Siguiente ➡️', 'Hasta $6,000');
  const item2 = camino('🎮 Consola', 'Xbox Series X', 'PS5', 'Siguiente ➡️', 'Sin límite').item;
  assert.ok(!matchWish({ title: 'Xbox Series X 1TB', precio: 9999 }, item));     // se pasa de 6 mil
  assert.ok(matchWish({ title: 'Consola Xbox Series X 1TB', precio: 9999 }, item2));
  assert.ok(matchWish({ title: 'PS5 Slim Digital + 2 juegos', precio: 7999 }, item2));
  assert.ok(!matchWish({ title: 'Videojuego Spider-Man 2 para PS5', precio: 899 }, item2));
  assert.ok(!matchWish({ title: 'Control DualSense PS5', precio: 1199 }, item2));
  assert.ok(!matchWish({ title: 'Xbox Series S 512GB', precio: 5999 }, item2));
});

test('herramienta con pregunta de una sola respuesta y audio sin base', () => {
  const { item } = camino('🔧 Herramienta', 'Taladro / rotomartillo', 'Siguiente ➡️', 'DeWalt', 'Bosch', 'Siguiente ➡️',
    'Sí, inalámbrica', 'Hasta $1,500');
  assert.equal(item.nombre, 'Herramienta · Taladro / rotomartillo · DeWalt o Bosch · Sí, inalámbrica');
  assert.ok(matchWish({ title: 'Taladro inalámbrico DeWalt 20V', precio: 1450 }, item));
  assert.ok(!matchWish({ title: 'Brocas para taladro DeWalt 20V inalámbrico', precio: 400 }, item));
  const audio = camino('🔊 Audio de casa', 'Minicomponente', 'Tornamesa', 'Siguiente ➡️', 'Cualquiera ➡️', 'Sin límite').item;
  assert.ok(matchWish({ title: 'LG XBOOM Minicomponente CL98', precio: 5499 }, audio));
  assert.ok(matchWish({ title: 'Tornamesa Audio-Technica AT-LP60X', precio: 2899 }, audio));
  assert.ok(!matchWish({ title: 'Bocina JBL Flip 6', precio: 1999 }, audio));
});

test('botones viejos o raros no rompen nada', () => {
  assert.deepEqual(tocar('q:c:nada:-:0:').state, { cat: null, paso: 0, sel: {} });
  assert.deepEqual(tocar('q:t:99:tv:0:').state.sel, {});
  assert.ok(!tocar('q:p:1:tv:0:').item); // precio desde un paso que no es el del precio
  assert.ok(tocar('q:x::-:0:').cancelado);
  assert.ok(armar(CATEGORIAS[0], {}, [null, null]).grupos.length === 1);
});

// --- con el worker y un KV de mentira -----------------------------------------------------------------
function kv() {
  const m = new Map();
  return {
    get: async (k, type) => (m.has(k) ? (type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v) => m.set(k, v),
    delete: async (k) => m.delete(k),
  };
}

test('el worker: botones, Otra cosa, 🗑️ y la llave', async () => {
  const llamadas = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { llamadas.push(String(url)); return new Response('<rss></rss>'); };
  try {
    const env = { LISTA: kv(), ADMIN: '111', WEBHOOK_SECRETO: 's' };
    const waits = [];
    const ctx = { waitUntil: (p) => waits.push(p) };
    const post = (path, body, headers) => worker.fetch(new Request(`https://x${path}`, { method: 'POST', headers, body: JSON.stringify(body) }), env, ctx);
    const tg = (update) => post('/', update, { 'X-Telegram-Bot-Api-Secret-Token': 's' }).then((r) => r.json());
    const from = { id: 111, first_name: 'X' };
    const chat = { id: 111, type: 'private' };
    const toca = (data) => tg({ callback_query: { id: 'cb1', from, data, message: { message_id: 9, chat } } });

    const start = await tg({ message: { from, chat, text: '/quiero' } });
    assert.equal(start.method, 'sendMessage');
    assert.match(start.text, /Qué buscas/);
    const tv = start.reply_markup.inline_keyboard.flat().find((b) => b.text === '📺 Tele').callback_data;
    const paso1 = await toca(tv);
    assert.deepEqual([paso1.method, paso1.message_id], ['editMessageText', 9]);
    assert.match(paso1.text, /Qué marca/);

    assert.equal((await post('/llave', { token: '123:' + 'a'.repeat(30) }, { 'X-Clave': 'mal' })).status, 401);
    assert.equal((await post('/llave', { token: 'basura' }, { 'X-Clave': 's' })).status, 400);
    assert.equal((await post('/llave', { token: '123:' + 'a'.repeat(30) }, { 'X-Clave': 's' })).status, 200);
    await toca(tv);
    await Promise.all(waits);
    assert.ok(llamadas.some((u) => u.endsWith('/answerCallbackQuery'))); // quita el "cargando"

    const fin = await toca('q:p:1:consola:1:1');
    assert.match(fin.text, /Apuntado[\s\S]*#1 Consola · PS5<\/b> · de \$6,000 a \$10,000/);

    const otra = await toca('q:o::-:0:');
    assert.match(otra.text, /Escríbeme qué buscas/);
    const escrito = await tg({ message: { from, chat, text: 'tornamesa hasta 3000' } });
    assert.match(escrito.text, /#2 Tornamesa<\/b> · hasta \$3,000/);
    assert.match((await tg({ message: { from, chat, text: 'tornamesas' } })).text, /Lo mejor de|Ahorita no hay/); // ya volvió a buscar

    const lista = await tg({ message: { from, chat, text: '/lista' } });
    assert.deepEqual(lista.reply_markup.inline_keyboard.flat().map((b) => b.callback_data), ['l:b:1', 'l:b:2']);
    const borrado = await toca('l:b:1');
    assert.match(borrado.text, /Borrado[\s\S]*#2 Tornamesa/);
    assert.deepEqual(borrado.reply_markup.inline_keyboard.flat().map((b) => b.callback_data), ['l:b:2']);

    const extraño = { id: 222, first_name: 'Y' };
    const ajeno = await tg({ callback_query: { id: 'cb2', from: extraño, data: tv, message: { message_id: 5, chat: { id: 222, type: 'private' } } } });
    assert.match(ajeno.text, /no puede usar la lista/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
