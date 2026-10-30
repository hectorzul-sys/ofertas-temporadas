// Contestador del bot de ofertas de la familia: le escriben "televisores" y responde con lo mejor de
// Promodescuentos en ese momento. Telegram le manda cada mensaje aquí (webhook) y la respuesta va en la
// misma contestación HTTP, así que este worker NO necesita la llave del bot.
// Secreto: WEBHOOK_SECRETO (el mismo que el secreto de GitHub con ese nombre; Telegram lo manda en cada mensaje).
import { FEEDS, answer, merge, parse, search } from './buscar.js';

const UA = 'ofertas-temporadas/1.0 (bot familiar personal, contesta preguntas; +https://github.com/hectorzul-sys/ofertas-temporadas)';
const AYUDA = '👋 Soy el bot de ofertas de la familia.\n\n' +
  '• Escríbeme lo que buscas: <b>televisores</b>, <b>freidora</b>, <b>ps5</b>, <b>refri</b>…\n' +
  '  En un grupo: <b>/buscar televisores</b>.\n' +
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

export default {
  async fetch(request, env) {
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
      if (name !== 'buscar') return isPrivate ? reply(chatId, AYUDA) : new Response('ok');
      text = rest.trim();
      if (!text) return reply(chatId, 'Dime qué buscar, por ejemplo: <b>/buscar televisores</b>');
    } else if (!isPrivate) {
      return new Response('ok'); // en grupos solo contesta /buscar, para no meterse en la plática
    }

    const results = search(await offers(), text);
    console.log(`Pregunta: "${text.slice(0, 60)}" → ${results.length} resultados`);
    return reply(chatId, answer(text, results));
  },
};
