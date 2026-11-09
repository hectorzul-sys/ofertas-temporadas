// Pruebas de la lista de compras: node --test contestador/lista.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from './buscar.js';
import worker, { borrar, permitir, quiero, verLista } from './index.js';
import { describe, matchWish, parseWish } from './lista.js';

const offer = (title, precio) => ({ title, precio, grados: 200 });
const t = (texto, title, precio) => matchWish(offer(title, precio), parseWish(texto));

test('lo que escribe la familia, sin precio', () => {
  assert.ok(t('televisor 4k', 'Pantalla TCL 55" 4K Smart TV', 7999));
  assert.ok(t('televisor 4k', 'Samsung Smart TV UHD 50 pulgadas', 6999));
  assert.ok(!t('televisor 4k', 'TV Hisense 43 pulgadas Full HD', 4500)); // no dice 4K
  assert.ok(!t('televisor 4k', 'Soporte para pantalla 4K de pared', 399)); // accesorio
  assert.ok(t('contol xbox', 'Control Xbox Series inalámbrico', 1199)); // corrige una letra
  assert.ok(t('minicmoponente', 'LG XBOOM Minicomponente', 5499)); // dos letras volteadas
  assert.ok(t('reproductor vnil', 'Tornamesa Audio-Technica', 2899) === false); // "vnil" es muy corta: no adivina
  assert.ok(t('televsor', 'Pantalla Hisense 50', 5999));
  assert.ok(t('control xbox', 'Control inalámbrico Xbox Series Carbon Black', 1199));
  assert.ok(t('control xbox', 'Mando Xbox Core', 999));
  assert.ok(!t('control xbox', 'Funda para control Xbox', 199));
  assert.ok(t('minicomponente', 'LG XBOOM Minicomponente CL98', 5499));
  assert.ok(t('minicomponente', 'Sony Equipo de sonido MHC-V13', 3999));
  assert.ok(t('reproductor vinil', 'Tornamesa Audio-Technica AT-LP60X', 2899));
  assert.ok(t('reproductor de vinil', 'Tocadiscos Crosley Cruiser', 1299));
  assert.ok(t('bocina home theater', 'Barra de sonido Samsung 5.1 HW-B650', 4999));
  assert.ok(t('bocina home theater', 'Sony Home Theater HT-S20R', 3999));
  assert.ok(t('xbox one series x', 'Consola Xbox Series X 1TB', 9999));
  assert.ok(!t('xbox one series x', 'Consola Xbox Series S 512GB', 5999));
});

test('precios, para quién y lo que no quiere', () => {
  const w = parseWish('/quiero televisor 4k de 5000 a 9000 sin curvo para papá');
  assert.deepEqual([w.min, w.max, w.para, w.nombre], [5000, 9000, 'papá', 'Televisor 4k']);
  assert.ok(w.excluir.includes('curvo'));
  assert.deepEqual([parseWish('taladro hasta 2,500').max, parseWish('taladro hasta 2.5 mil').max], [2500, 2500]);
  assert.deepEqual([parseWish('taladro entre 1500 y 3k').min, parseWish('taladro entre 1500 y 3k').max], [1500, 3000]);
  assert.equal(parseWish('taladro desde $1,000').min, 1000);
  assert.equal(parseWish('taladro $2500').max, 2500);
  assert.equal(parseWish('quiero un taladro dewalt para mi papá').para, 'mi papá');
  assert.equal(parseWish('soporte para tv').para, null); // "para tv" es una cosa, no una persona
  assert.ok(!parseWish('cable hdmi 2.1').excluir.includes('cable')); // si lo pide, no lo excluye
  assert.equal(parseWish('hasta 9000'), null);
  assert.equal(parseWish('contol xbox').nombre, 'Control xbox'); // el nombre también sale corregido
  assert.ok(t('televisor de 5000 a 9000', 'Pantalla LG 55 4K', 8999));
  assert.ok(!t('televisor de 5000 a 9000', 'Pantalla LG 75 4K', 15999));
  assert.ok(!t('televisor de 5000 a 9000', 'Pantalla LG 32 HD', 3999));
  assert.ok(!t('televisor de 5000 a 9000', 'Pantalla LG 55 4K', null)); // sin precio no se sabe
  assert.ok(t('televisor', 'Pantalla LG 55 4K', null)); // sin rango, sí
  const d = describe({ ...w, n: 3 });
  assert.match(d, /#3 Televisor 4k/);
  assert.match(d, /de \$5,000 a \$9,000/);
  assert.match(d, /para papá/);
  assert.match(d, /sin: curvo/);
  assert.doesNotMatch(d, /funda/); // los accesorios no se enseñan, solo lo que pidió
});

// --- el worker con un KV de mentira --------------------------------------------------------------
function kv() {
  const m = new Map();
  return { get: async (k, type) => (m.has(k) ? (type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => m.set(k, v) };
}
const RSS = `<rss><channel><item><pepper:merchant name="Amazon" price="$7,999"/>
<title><![CDATA[420° - Amazon: Pantalla TCL 55" 4K Smart TV]]></title><link>https://www.promodescuentos.com/ofertas/tcl-1</link></item>
</channel></rss>`;
const ADMIN = '111';
const msg = (from, chat = from, type = 'private') => ({ from: { id: Number(from), first_name: 'X' }, chat: { id: Number(chat), type } });

test('quiero, lista, borrar y permitir', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(RSS);
  try {
    const env = { LISTA: kv(), ADMIN, WEBHOOK_SECRETO: 's' };
    assert.match(await quiero(env, msg('222'), 'tv'), /no puede usar la lista/); // desconocido
    const a = await quiero(env, msg(ADMIN), 'quiero televisor 4k hasta 9000');
    assert.match(a, /Apuntado/);
    assert.match(a, /Ahorita ya hay/);
    assert.match(a, /TCL/);
    assert.match(await permitir(env, msg('222', '-5', 'group')), /Solo el dueño/);
    assert.match(await permitir(env, msg(ADMIN, '-5', 'group')), /ya puede usar/);
    assert.match(await quiero(env, msg('222', '-5', 'group'), 'taladro para papá'), /#2 Taladro/);
    assert.match(await verLista(env, msg('222', '-5', 'group')), /#1 Televisor 4k[\s\S]*#2 Taladro/);
    assert.match(await borrar(env, msg('222', '-5', 'group'), '1'), /Solo quien lo apuntó/);
    assert.match(await borrar(env, msg('222', '-5', 'group'), '2'), /Borrado/);
    assert.match(await borrar(env, msg(ADMIN, '-5', 'group'), '7'), /No encuentro/);

    const get = (clave) => worker.fetch(new Request('https://x/lista', { headers: clave ? { 'X-Clave': clave } : {} }), env);
    assert.equal((await get()).status, 401);
    assert.equal((await get('mal')).status, 401);
    const { items } = await (await get('s')).json();
    assert.deepEqual(items.map((i) => i.n), [1]);
    assert.equal(items[0].max, 9000);

    const tg = (text) => worker.fetch(new Request('https://x/', {
      method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 's' },
      body: JSON.stringify({ message: { ...msg(ADMIN), text } }),
    }), env).then((r) => r.json());
    assert.match((await tg('quiero minicomponente')).text, /#3 Minicomponente/); // en privado, sin diagonal
    assert.match((await tg('/lista@ofertas_buenasbot')).text, /#3/);
    assert.match((await tg('televisores')).text, /Lo mejor de televisores/); // buscar sigue igual
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('el feed sigue igual', () => {
  assert.equal(parse(RSS)[0].precio, 7999);
});
