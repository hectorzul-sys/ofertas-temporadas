// Contestador del bot de ofertas de la familia: le escriben "televisores" y responde con lo mejor de
// Promodescuentos en ese momento. Telegram le manda cada mensaje aquí (webhook) y la respuesta va en la
// misma contestación HTTP, así que este worker NO necesita la llave del bot.
// También lleva la LISTA DE COMPRAS de la familia (/quiero, /lista, /borrar), guardada en Cloudflare KV (binding LISTA).
// El bot de Python la lee cada hora en GET /lista con la cabecera X-Clave.
// Secretos: WEBHOOK_SECRETO (el mismo que el secreto de GitHub con ese nombre; Telegram lo manda en cada mensaje)
// y ADMIN (número de usuario de Telegram de quien manda en el bot: puede /permitir chats y borrar cualquier cosa).
// El cuestionario con botones (/quiero solo) vive en cuestionario.js y catalogo.js: cada botón lleva lo elegido.
// Solo "Otra cosa" en privado deja una marca en KV ("cq:<chat>:<usuario>", 2 h) para tomar el siguiente texto. La llave del bot (para quitar el "cargando" de los botones) la manda
// el propio bot en el modo "conectar" a POST /llave y se guarda en KV ("llave"); sin ella todo funciona igual.
import { FEEDS, answer, formatLines, merge, parse, search } from './buscar.js';
import { inicio, pantalla, tocar } from './cuestionario.js';
import { describe, matchWish, parseWish } from './lista.js';

const UA = 'ofertas-temporadas/1.0 (bot familiar personal, contesta preguntas; +https://github.com/hectorzul-sys/ofertas-temporadas)';
const MAX_COSAS = 40;
const EJEMPLO = '<b>/quiero televisor 4k de 5000 a 9000</b>';
const AYUDA = '👋 Soy el bot de ofertas de la familia.\n\n' +
  '• Escríbeme lo que buscas: <b>televisores</b>, <b>freidora</b>, <b>ps5</b>…\n' +
  '  En un grupo: <b>/buscar televisores</b>.\n' +
  '• Apunta lo que quieres y te aviso cuando salga: escribe <b>/quiero</b> y te hago unas preguntas con botones.\n' +
  `  O dilo de una vez: ${EJEMPLO} (también <b>sin curvo</b>, <b>para papá</b>).\n` +
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

function telegram(body) {
  return new Response(JSON.stringify({ parse_mode: 'HTML', disable_web_page_preview: true, ...body }),
    { headers: { 'Content-Type': 'application/json' } });
}
const markup = (keyboard) => (keyboard && keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {});
function reply(chatId, text, keyboard) {
  return telegram({ method: 'sendMessage', chat_id: chatId, text, ...markup(keyboard) });
}
function edit(chatId, messageId, text, keyboard) {
  return telegram({ method: 'editMessageText', chat_id: chatId, message_id: messageId, text, ...markup(keyboard) });
}

const quizKey = (msg) => `cq:${msg.chat.id}:${msg.from?.id}`;
const getQuiz = (env, msg) => env.LISTA.get(quizKey(msg), 'json');
const putQuiz = (env, msg, state) => env.LISTA.put(quizKey(msg), JSON.stringify(state), { expirationTtl: 7200 });
const dropQuiz = (env, msg) => env.LISTA.delete(quizKey(msg));

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
  return apuntar(env, msg, item);
}

// Guarda una cosa (venga del texto o del cuestionario) y enseña lo que ya haya ahorita.
export async function apuntar(env, msg, item) {
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

// Un 🗑️ por cada cosa que esta persona puede borrar (las suyas; el dueño, todas).
export async function botonesLista(env, msg) {
  const { items } = await getLista(env);
  const own = items.filter((i) => isAdmin(env, msg) || i.de === String(msg.from?.id));
  const buttons = own.map((i) => ({ text: `🗑️ #${i.n}`, callback_data: `l:b:${i.n}` }));
  return buttons.reduce((out, b, k) => (k % 4 ? out[out.length - 1].push(b) : out.push([b]), out), []);
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

// Un toque en un botón: avanzar el cuestionario o borrar desde /lista. Responde editando el mismo mensaje.
export async function boton(env, cq) {
  const msg = { from: cq.from, chat: cq.message.chat };
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const data = cq.data || '';
  if (!(await allowed(env, msg))) return edit(chatId, messageId, NO_PERMITIDO);

  if (data.startsWith('l:b:')) {
    const done = await borrar(env, msg, data.slice(4));
    const text = `${done}\n\n${await verLista(env, msg)}`;
    return edit(chatId, messageId, text, await botonesLista(env, msg));
  }
  if (!data.startsWith('q:')) return new Response('ok');
  const r = tocar(data);
  if (r.cancelado) return edit(chatId, messageId, 'Listo, no apunté nada. Cuando quieras: /quiero');
  if (r.otra) {
    if (cq.message.chat.type !== 'private') {
      return edit(chatId, messageId, `✏️ Escribe /quiero y lo que buscas, por ejemplo: ${EJEMPLO}`);
    }
    await putQuiz(env, msg, { escribir: true });
    return edit(chatId, messageId, '✏️ Escríbeme qué buscas, como lo dirías. Por ejemplo: <b>tornamesa hasta 3000</b> o ' +
      '<b>taladro dewalt 20v para papá</b>.');
  }
  if (r.item) return edit(chatId, messageId, await apuntar(env, msg, r.item));
  const p = pantalla(r.state);
  return edit(chatId, messageId, p.text, p.keyboard);
}

// Quita el "cargando" del botón que tocaron (necesita la llave del bot; si no está, no pasa nada).
async function soltarBoton(env, cq) {
  const token = await env.LISTA.get('llave');
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: cq.id }),
  }).catch(() => {});
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const clave = request.headers.get('X-Clave');
    if (request.method === 'GET' && url.pathname === '/lista') {
      if (!env.WEBHOOK_SECRETO || clave !== env.WEBHOOK_SECRETO) return new Response('no', { status: 401 });
      const { items } = await getLista(env);
      return Response.json({ items });
    }
    if (request.method === 'POST' && url.pathname === '/llave') {
      if (!env.WEBHOOK_SECRETO || clave !== env.WEBHOOK_SECRETO) return new Response('no', { status: 401 });
      const { token } = await request.json().catch(() => ({}));
      if (!/^\d+:[\w-]{20,}$/.test(token || '')) return new Response('llave rara', { status: 400 });
      await env.LISTA.put('llave', token);
      return new Response('ok');
    }
    if (request.method !== 'POST') return new Response('ok');
    if (!env.WEBHOOK_SECRETO || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRETO) {
      return new Response('no', { status: 401 });
    }
    const update = await request.json().catch(() => ({}));
    if (update.callback_query?.message) {
      ctx?.waitUntil(soltarBoton(env, update.callback_query));
      return boton(env, update.callback_query);
    }
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
      if (name === 'quiero' || name === 'apunta') {
        if (rest.trim()) return reply(chatId, await quiero(env, msg, rest));
        if (!(await allowed(env, msg))) return reply(chatId, NO_PERMITIDO);
        const p = inicio();
        return reply(chatId, p.text, p.keyboard);
      }
      if (name === 'lista') return reply(chatId, await verLista(env, msg), await botonesLista(env, msg));
      if (name === 'borrar') return reply(chatId, await borrar(env, msg, rest));
      if (name === 'permitir') return reply(chatId, await permitir(env, msg));
      if (name !== 'buscar') return isPrivate ? reply(chatId, AYUDA) : new Response('ok');
      text = rest.trim();
      if (!text) return reply(chatId, 'Dime qué buscar, por ejemplo: <b>/buscar televisores</b>');
    } else if (!isPrivate) {
      return new Response('ok'); // en grupos solo contesta comandos, para no meterse en la plática
    } else if (/^(?:quiero|apuntar)$/i.test(text)) {
      const p = inicio(); // "quiero" solo, en privado: el cuestionario
      return (await allowed(env, msg)) ? reply(chatId, p.text, p.keyboard) : reply(chatId, NO_PERMITIDO);
    } else if (/^(?:quiero|quisiera|ap[uú]nta(?:me)?|anota)\s/i.test(text)) {
      return reply(chatId, await quiero(env, msg, text)); // en privado basta con "quiero televisor 4k"
    } else if ((await getQuiz(env, msg))?.escribir) {
      await dropQuiz(env, msg); // tocó "Otra cosa" y ahora lo escribe
      return reply(chatId, await quiero(env, msg, text));
    }

    const results = search(await offers(), text);
    console.log(`Pregunta: "${text.slice(0, 60)}" → ${results.length} resultados`);
    return reply(chatId, answer(text, results));
  },
};
