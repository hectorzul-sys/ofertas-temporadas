# Ofertas de temporada

Bot familiar pequeño: lee el RSS público de [Promodescuentos](https://www.promodescuentos.com) una vez por hora,
se queda con las ofertas de unas pocas categorías (ver [categorias.yaml](categorias.yaml)) y manda por Telegram
pocos avisos al día y un resumen a las 21:00 (hora de CDMX).

- Siempre enlaza a la página de la oferta en Promodescuentos.
- Lo que guarda en `data/` va cifrado: es solo para el historial de precios del propio bot.
- Identificador del bot al leer: `ofertas-temporadas/1.0`.

| Archivo | Qué es |
|---|---|
| `src/feed.py` | Lee los feeds `tendencias` (con grados) y `todas` |
| `src/filtro.py` | Categorías, lista privada de productos y el control para no repetir avisos |
| `src/historial.py` | Todo lo visto, para "visto antes a $X" |
| `src/notifier.py` | Formato y envío por Telegram |
| `src/main.py` | Orquesta todo: tope diario, resumen, aviso si el feed falla |
