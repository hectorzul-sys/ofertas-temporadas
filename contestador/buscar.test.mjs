// Pruebas del contestador: node --test contestador/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answer, merge, parse, search, terms } from './buscar.js';

const RSS = `<rss xmlns:pepper="http://www.pepper.com/rss"><channel>
<item><pepper:merchant name="Amazon" price="$7,999"/><title><![CDATA[420° - Amazon: Pantalla TCL 55" 4K Smart TV]]></title>
<link>https://www.promodescuentos.com/ofertas/tcl-1</link></item>
<item><pepper:merchant name="Walmart" price="$4,500"/><title><![CDATA[150° - Walmart: TV Hisense 43 pulgadas]]></title>
<link>https://www.promodescuentos.com/ofertas/hisense-2</link></item>
<item><pepper:merchant name="Mobo" price="$99"/><title><![CDATA[900° - Mobo: Soporte para pantalla]]></title>
<link>https://www.promodescuentos.com/ofertas/soporte-3</link></item>
<item><pepper:merchant name="Liverpool" price="$1,299"/><title><![CDATA[Liverpool: Freidora de aire 5 L]]></title>
<link>https://www.promodescuentos.com/ofertas/freidora-4</link></item>
</channel></rss>`;

test('lee el feed', () => {
  const items = parse(RSS);
  assert.equal(items.length, 4);
  assert.deepEqual([items[0].grados, items[0].precio, items[0].tienda], [420, 7999, 'Amazon']);
  assert.equal(items[3].grados, null);
});

test('televisores encuentra pantallas y tv, sin accesorios, por grados', () => {
  const r = search(parse(RSS), 'las mejores ofertas de televisores');
  assert.deepEqual(r.map((o) => o.id), ['1', '2']);
});

test('singular, plural y acentos', () => {
  assert.deepEqual(search(parse(RSS), 'Freidoras').map((o) => o.id), ['4']);
  assert.deepEqual(terms('televisión'), terms('tele'));
});

test('merge conserva los grados', () => {
  const m = merge([[{ id: '1', grados: null }], [{ id: '1', grados: 99 }]]);
  assert.equal(m[0].grados, 99);
});

test('respuestas', () => {
  const text = answer('televisores', search(parse(RSS), 'televisores'));
  assert.match(text, /\$7,999/);
  assert.match(text, /Keepa/);
  assert.match(answer('<b>yates</b>', []), /Ahorita no hay ofertas de <b>&lt;b&gt;yates/);
});
