// Contestador del bot de ofertas de la familia: le escriben "televisores" y responde con lo mejor de
// Promodescuentos en ese momento. Telegram le manda cada mensaje aquí (webhook) y la respuesta va en la
// misma contestación HTTP, así que este worker NO necesita la llave del bot.
// También lleva la LISTA DE COMPRAS de la familia (/quiero, /lista, /borrar), guardada en Cloudflare KV (binding LISTA).
// El bot de Python la lee cada hora en GET /lista con la cabecera X-Clave.
// Secretos: WEBHOOK_SECRETO (el mismo que el secreto de GitHub con ese nombre; Telegram lo manda en cada mensaje)
// y ADMIN (número de usuario de Telegram de quien manda en el bot: puede /permitir chats y borrar cualquier cosa).
import { FEEDS, answer, formatLines, merge, parse, search } from './buscar.js';
import { describe, matchWish, parseWish } from './lista.js';

const UA = 'ofertas-temporadas/1.0 (bot familiar personal, contesta preguntas; +https://github.com/hectorzul-sys/ofertas-temporadas)';
const MAX_COSAS = 40;
const EJEMPLO = '<b>/quiero televisor 4k de 5000 a 9000</b>';
const AYUDA = '👋 Soy el bot de ofertas de la familia.\n\n' +
  '• Escríbeme lo que buscas: <b>televisores</b>, <b>freidora</b>, <b>ps5</b>…\n' +
  '  En un grupo: <b>/buscar televisores</b>.\n' +
  `• Apunta lo que quieres y te aviso cuando salga: ${EJEMPLO}\n` +
  '  También: <b>hasta 9000</b>, <b>sin curvo</b>, <b>para papá</b>.\n' +
  '• /lista muestra lo apuntado · <b>/borrar 3</b> quita el número 3.\n' +
  '• Te mando avisos de electrodomésticos y tecnología, y un resumen a las 21:00.\n' +
  '• /id te dice el número de este chat (para Claude).';

async function offers() {
  // Caché de 10 min en Cloudflare: aunque pregunten mucho, a Promodescuentos le llega muy poco.
  const lists = await Promise.all(FEEDS.map(async (url) => {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, cf: { cacheTtl: 600, cacheEverything: true } });
      return r.ok ? parse(await r.text()) : [];
    } catch {
      return [];
    }
  }));
  return merge(lists);
}

function reply(chatId, text) {
  return new Response(JSON.stringify({
    method: 'sendMessage', chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true,
  }), { headers: { 'Content-Type': 'application/json' } });
}

const getLista = async (env) => (await env.LISTA.get('lista', 'json')) || { sig: 1, items: [] };
const putLista = (env, lista) => env.LISTA.put('lista', JSON.stringify(lista));
const isAdmin = (env, msg) => Boolean(env.ADMIN) && String(msg.from?.id) === String(env.ADMIN).trim();

async function allowed(env, msg) {
  if (isAdmin(env, msg)) return true;
  const chats = (await env.LISTA.get('chats', 'json')) || [];
  return chats.includes(String(msg.chat.id));
}

const NO_PERMITIDO = '🔒 Este chat todavía no puede usar la lista. El dueño del bot la activa escribiendo /permitir aquí.';

export async function quiero(env, msg, text) {
  if (!(await allowed(env, msg))) return NO_PERMITIDO;
  const item = parseWish(text);
  if (!item) return `Dime qué quieres, por ejemplo: ${EJEMPLO}`;
  const lista = await getLista(env);
  if (lista.items.length >= MAX_COSAS) return `La lista ya tiene ${MAX_COSAS} cosas. Borra alguna con <b>/borrar número</b>.`;
  Object.assign(item, {
    n: lista.sig, de: String(msg.from?.id ?? ''), quien: msg.from?.first_name || '', fecha: new Date().toISOString().slice(0, 10),
  });
  lista.sig += 1;
  lista.items.push(item);
  await putLista(env, lista);
  console.log(`Apuntado #${item.n}: "${item.nombre}"`);
  let out = `✅ <b>Apuntado</b>\n${describe(item)}\n\nCuando salga una oferta así te aviso. ` +
    'Si busqué mal, bórralo y escríbelo distinto.';
  const ahora = (await offers()).filter((o) => matchWish(o, item)).sort((a, b) => (b.grados ?? -1) - (a.grados ?? -1));
  if (ahora.length) out += `\n\n🔥 <b>Ahorita ya hay:</b>\n\n${formatLines(ahora.slice(0, 3))}`;
  return out;
}

export async function verLista(env, msg) {
  if (!(await allowed(env, msg))) return NO_PERMITIDO;
  const { items } = await getLista(env);
  if (!items.length) return `📝 La lista está vacía. Apunta algo: ${EJEMPLO}`;
  return `📝 <b>Lista de compras</b> (${items.length})\n\n${items.map(describe).join('\n\n')}\n\n<i>Para quitar una: /borrar número</i>`;
}

export async function borrar(env, msg, rest) {
  if (!(await allowed(env, msg))) return NO_PERMITIDO;
  const n = parseInt((rest.match(/\d+/) || [])[0], 10);
  if (!n) return 'Dime el número, por ejemplo: <b>/borrar 3</b> (los números salen en /lista).';
  const lista = await getLista(env);
  const item = lista.items.find((i) => i.n === n);
  if (!item) return `No encuentro el número ${n}. Mira /lista.`;
  if (!isAdmin(env, msg) && item.de !== String(msg.from?.id)) return 'Solo quien lo apuntó puede borrarlo.';
  lista.items = lista.items.filter((i) => i.n !== n);
  await putLista(env, lista);
  return `🗑️ Borrado: ${describe(item).split('\n')[0]}`;
}

export async function permitir(env, msg) {
  if (!isAdmin(env, msg)) return 'Solo el dueño del bot puede activar la lista en un chat.';
  const chats = (await env.LISTA.get('chats', 'json')) || [];
  const id = String(msg.chat.id);
  if (!chats.includes(id)) {
    chats.push(id);
    await env.LISTA.put('chats', JSON.stringify(chats));
  }
  return '✅ Este chat ya puede usar la lista: /quiero, /lista y /borrar.';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/lista') {
      if (!env.WEBHOOK_SECRETO || request.headers.get('X-Clave') !== env.WEBHOOK_SECRETO) return new Response('no', { status: 401 });
      const { items } = await getLista(env);
      return Response.json({ items });
    }
    if (request.method !== 'POST') return new Response('ok');
    if (!env.WEBHOOK_SECRETO || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRETO) {
      return new Response('no', { status: 401 });
    }
    const update = await request.json().catch(() => ({}));
    const msg = update.message;
    if (!msg || !msg.text) return new Response('ok');
    const chatId = msg.chat.id;
    const isPrivate = msg.chat.type === 'private';
    let text = msg.text.trim();

    const cmd = text.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/);
    if (cmd) {
      const [, name, rest] = cmd;
      if (name === 'start' || name === 'ayuda' || name === 'help') return reply(chatId, AYUDA);
      if (name === 'id') return reply(chatId, `🆔 Este chat es <code>${chatId}</code>`);
      if (name === 'quiero' || name === 'apunta') return reply(chatId, await quiero(env, msg, rest));
      if (name === 'lista') return reply(chatId, await verLista(env, msg));
      if (name === 'borrar') return reply(chatId, await borrar(env, msg, rest));
      if (name === 'permitir') return reply(chatId, await permitir(env, msg));
      if (name !== 'buscar') return isPrivate ? reply(chatId, AYUDA) : new Response('ok');
      text = rest.trim();
      if (!text) return reply(chatId, 'Dime qué buscar, por ejemplo: <b>/buscar televisores</b>');
    } else if (!isPrivate) {
      return new Response('ok'); // en grupos solo contesta comandos, para no meterse en la plática
    } else if (/^(?:quiero|quisiera|ap[uú]nta(?:me)?|anota)\s/i.test(text)) {
      return reply(chatId, await quiero(env, msg, text)); // en privado basta con "quiero televisor 4k"
    }

    const results = search(await offers(), text);
    console.log(`Pregunta: "${text.slice(0, 60)}" → ${results.length} resultados`);
    return reply(chatId, answer(text, results));
  },
};
