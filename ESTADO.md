Viene de la incubadora, idea 2026-10-28-bot-ofertas-temporadas (y del plan maestro 2026-10-24-plan-maestro, taller 40).

# Estado — Ofertas de temporada (40.02)

**En qué vamos:** Racha 1, Fases 0-1. Bot programado (10 pruebas OK), repo **público** `hectorzul-sys/ofertas-temporadas`
creado y comprobado, primera corrida en GitHub correcta (48 ofertas leídas, guardado cifrado). Ya guarda lo visto
desde el 28-oct. **Todavía no manda avisos**: falta la llave del bot.

**Decisiones de Claude (Hector dijo "decide tú"):**
- Términos de Promodescuentos: no prohíben el uso automático, sí "la reproducción en otros sitios web". Por eso `data/` va cifrado en el repo público.
- Feeds: `/rss/tendencias` (30 ofertas, con grados, ~5 h) y `/rss/todas` (30 nuevas, sin grados, ~3 h). No hay feed por grupo (404). Las categorías usan grados; la lista de productos usa los dos.
- Aviso al momento solo si la oferta tiene una **palabra** de su categoría (o 600°+); lo demás de la categoría va al resumen de las 21:00.
- Mapeo a categorías reales del feed (Hogar, Tecnología, Videojuegos, Ropa y accesorios, Abarrotes y alimentos, Jardín y hazlo tú mismo, Familia, bebés y niños).
- Respaldo `schedule` de GitHub cada 1-2 h hasta que el despertador funcione; el bot no relee si leyó hace < 45 min.
- `productos.yaml` empieza vacío (no sé qué quiere la familia todavía).

**Qué falta (de Hector):** ver `GUIA-FASE-0.md`: llave del bot (copiar en BotFather), repo nuevo en su token de GitHub
y el sí para publicar el despertador (ya editado, sin publicar), Keepa, alertas, favoritos, Profeco, grupo, juzgar 10 avisos.
**Qué falta (de Claude):** subir la llave y mandar la prueba; publicar el despertador; ajustar con los 10 avisos; corte el 6-nov;
grupo de la familia 7-12 nov (ensayo 11-nov, nada nuevo desde el 9, congelar el 12).

## Sesiones
- 2026-10-28/29 — Desde la incubadora (idea 2026-10-28-bot-ofertas-temporadas). Carpeta, CLAUDE.md, bot completo, repo público, secretos, primera corrida, despertador editado (sin publicar: permiso bloqueado), guía de la Fase 0.
