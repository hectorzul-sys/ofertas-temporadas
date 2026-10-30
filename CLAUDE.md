# Ofertas de temporada (bot familiar)

Viene de la incubadora: idea 2026-10-28-bot-ofertas-temporadas (veredicto: cambiar enfoque).
Taller 40 Colección y vitrina, hermano de `..\ofertas` (monitor K-pop). ID de proyecto: 40.02.

## Qué es
Un bot que lee las ofertas de Promodescuentos, se queda con las que encajan en las categorías
y productos de la familia de Hector, y manda pocos avisos y un resumen diario a un grupo de Telegram.
Para Hector y su familia. No es parte de Colección ni de Entre Dos; nada de Cristal aquí.

## Enfoque
- Lo hecho primero: Keepa (Amazon), alertas de Promodescuentos, favoritos de Mercado Libre y el
  portal de Profeco se usan a mano. El bot es un añadido, no el plan principal.
- Única fuente automática: el RSS de Promodescuentos (`/rss/tendencias` con grados y `/rss/todas` sin grados;
  1 lectura por hora, identificador honesto, seguir redirecciones, guardar solo datos cortos, enlazar siempre a su página).
- Términos de Promodescuentos (leídos el 28-oct-2026): no prohíben el uso automático; prohíben
  "la reproducción en otros sitios web sin autorización previa". Por eso **todo lo guardado en `data/` va cifrado**
  (clave `DATOS_CLAVE`: secreto de GitHub y archivo `.clave` local, fuera de git). Nunca subir ofertas en claro.
- Sin scraping de Amazon, Mercado Libre, Liverpool, Walmart ni Coppel (hasta que una prueba lo justifique).
- Sin etiqueta "descuento real" hasta tener meses de historial propio (2027). Mientras: grados,
  "visto antes a $X", enlace a Keepa y recordar Profeco para lo caro.

## Herramientas
- Python, copiado del monitor K-pop: storage, notifier, "no repetir" de rules, Http, plantilla del workflow.
- GitHub Actions en **repo público** `hectorzul-sys/ofertas-temporadas` (los minutos privados son de
  la cuenta y los usa el K-pop). Disparo con `workflow_dispatch` desde el despertador de Cloudflare
  que vive en `..\ofertas\despertador` (segunda llamada; no añadir cron triggers). Respaldo: `schedule` de GitHub.
- Telegram: **bot propio de la familia** (decidido por Hector el 29-oct-2026, porque lo pasará a su familia),
  aparte de @ofertas_kpop_hector_bot. Su llave va solo en el secreto `TELEGRAM_BOT_TOKEN` de este repo.
  Primero al chat privado de Hector (1851127359, después de que toque "Iniciar"); desde el 7-nov, al grupo de la familia.
- Secretos en GitHub: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `PRODUCTOS` (lista privada), `DATOS_CLAVE`.

## Archivos que se editan
- `categorias.yaml` (en el repo): categorías, palabras, grados mínimos, precio máximo, temporadas.
- `productos.yaml` (local, fuera de git): se sube como secreto con `gh secret set PRODUCTOS -R hectorzul-sys/ofertas-temporadas < productos.yaml`.
Hector no edita a mano: le dice a Claude qué cambiar.

## Comandos
- Pruebas: `.venv\Scripts\python -m unittest -q`
- Ensayo con el feed real (no manda ni guarda): `.venv\Scripts\python -m src.main --dry-run --digest-now`
- Desde GitHub: Actions → "Ofertas de temporada" → Run workflow → `normal`, `resumen`, `prueba` o `ensayo`
  (`gh workflow run temporadas.yml -R hectorzul-sys/ofertas-temporadas -f modo=prueba`).
- Leer lo guardado: `storage.load("data/estado.json", {})` con `.clave` presente.

## Fases
0. A mano (28-29 oct): Keepa, alertas, favoritos, grupo de Telegram, leer condiciones de Promodescuentos.
1. Primer aviso al chat de Hector (hasta 1-nov).
2. Tope, no repetir, resumen 21:00, lista de productos (hasta 6-nov; corte ese día).
3. Familia en el grupo y ensayo (hasta 12-nov; nada nuevo desde el 9-nov; ensayo el 11).
4. Buen Fin 13-17 nov: solo operación (el 16 es festivo: revisar que corra).
5. Revisión y Black Friday 27-nov / Cyber Monday 30-nov. Después: historial propio para 2027.

## Reglas
- Hablar con Hector en español, claro y sin tecnicismos. Él no programa: dirige a Claude.
- Nunca pedirle que teclee datos ni pegue tokens por el chat (usa `gh secret set` o `wrangler secret put`).
- 0 €. Antes de algo de pago o en la nube nuevo: explicar el coste y pedir permiso.
- Pocos avisos y buenos: no subir el tope sin que Hector lo pida.
- No tocar el monitor K-pop salvo la segunda llamada del despertador; si se toca, apuntarlo en ambos proyectos.
- Mantener `ESTADO.md` corto: en qué vamos, qué falta y una línea con fecha por sesión.
