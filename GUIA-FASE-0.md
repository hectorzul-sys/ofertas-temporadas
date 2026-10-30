# Fase 0 — lo que haces tú (≈ 1 hora, sin teclear datos ni llaves)

Hecho por Claude el 28/29-oct: repo público creado, bot programado y probado, primera corrida en GitHub
(ya guarda todo lo visto, cifrado), secretos puestos (tu chat, la clave de cifrado, la lista de productos).
Cuando termines un paso, díselo a Claude ("ya hice el 1") y él sigue.

## 1. Lo que desbloquea el bot (lo más importante, 5 min)

**1a. Crear el bot nuevo de la familia** (decidido el 29-oct: bot propio, aparte del K-pop):
1. En Telegram (en la PC), abre **@BotFather** → escribe `/newbot`.
2. Nombre que verá la familia: por ejemplo **Ofertas familia**.
3. Usuario (tiene que acabar en `bot`): por ejemplo **ofertas_familia_hector_bot** (si está ocupado, prueba otro).
4. BotFather te da la llave: toca la llave para **copiarla** (no la pegues en ningún lado).
5. Dile a Claude: **"ya copié la llave del bot nuevo"**. Claude la sube como secreto directo del portapapeles
   (`Get-Clipboard | gh secret set TELEGRAM_BOT_TOKEN -R hectorzul-sys/ofertas-temporadas`).
   Después copia cualquier otra cosa para que la llave no se quede en el portapapeles.
6. Abre el chat con tu bot nuevo y toca **Iniciar** (Start): sin eso, el bot no puede escribirte.
   Claude te manda un mensaje de prueba.

**1b. Añadir el repo nuevo a tu token de GitHub** (para que el despertador de Cloudflare lo despierte cada hora):
1. GitHub → tu foto → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**.
2. Abre el token del despertador (el que tiene acceso a `ofertas-kpop`) → **Repository access** →
   añade **ofertas-temporadas** → **Update**. No cambia la llave: no hay que ponerla en ningún lado.
3. Dile a Claude "ya añadí el repo al token" y **"sí, publica el despertador"**: falta publicarlo
   (`npx.cmd wrangler deploy` en `ofertas\despertador`). A Claude le pidieron tu permiso para eso.
   Hasta entonces el bot corre con el reloj de GitHub, que se salta corridas.

## 2. Keepa (Amazon México, 15 min)
1. En tu navegador instala la extensión **Keepa** (Chrome Web Store o Firefox add-ons; gratis).
2. Crea cuenta en keepa.com (con tu correo; la contraseña la pones tú).
3. Abre en Amazon.com.mx 5 a 10 cosas que la familia quiera. En la gráfica de Keepa de cada una:
   **Track product** → pon el **precio deseado** → guarda.
4. En keepa.com → **Settings** → **Notifications**: activa correo, y Telegram si lo deja el plan gratis.
5. Dile a Claude la lista ("freidora X hasta $1,200"): él la pone también en `productos.yaml` para el bot.

## 3. Alertas de Promodescuentos (5 min, respaldo si el bot falla)
En la app o web de Promodescuentos → **Crear alerta** → 3 a 5 palabras (por ejemplo: freidora, ps5, ssd, lego, taladro).

## 4. Favoritos de Mercado Libre (5 min)
Guarda con el ❤️ lo que quieras; Mercado Libre avisa de bajadas en favoritos. Opcional en Chrome: extensión **Melibel** para ver el historial.

## 5. Profeco (1 min)
Guarda en favoritos **https://qqp.profeco.gob.mx/** (Quién es Quién en los Precios). Antes de comprar algo caro
en el Buen Fin, compara ahí. Los avisos del bot de más de $3,000 ya te lo recuerdan.

## 6. Grupo de la familia (5 min; se usa a partir del 7-nov)
1. En Telegram: **Nuevo grupo** → ponle nombre (ej. "Ofertas familia") → añade a la familia y a **tu bot nuevo** (el del paso 1a).
2. Escribe cualquier cosa en el grupo ("hola bot").
3. Dile a Claude "ya está el grupo": él saca el `chat_id` solo. **Los avisos siguen yendo solo a ti hasta el corte del 6-nov.**

## 7. Juzgar 10 avisos (del 30-oct al 6-nov)
Cuando te lleguen, dile a Claude cuáles te sirvieron y cuáles no ("el 3 no, no queremos alcohol").
Él ajusta grados y palabras. Corte el 6-nov: si sirven menos de 5 de 10, no pasa a la familia.
