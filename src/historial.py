"""Todo lo visto, desde el primer día (para "visto antes a $X" y para el historial de 2027).

- data/vistos-AAAA-MM.json: {id: {t, tienda, cat, precio, grados, primero, ultimo, link}} por mes.
- data/precios.json: {clave de título: [{id, precio, fecha}, …]} (últimos 20), para encontrar
  la misma cosa aunque se publique otra vez con otro id.
"""

from . import storage
from .filtro import title_key

PRICES_FILE = "data/precios.json"
MAX_PRICES = 20


def month_file(today):
    return f"data/vistos-{today:%Y-%m}.json"


def record(offers, today, save=True):
    """Guarda lo visto en esta corrida. Devuelve el índice de precios ANTERIOR (para "visto antes")."""
    day = today.isoformat()
    path = month_file(today)
    seen = storage.load(path, {})
    prices = storage.load(PRICES_FILE, {})
    before = {k: list(v) for k, v in prices.items()}
    for o in offers:
        rec = seen.get(o["id"]) or {"primero": day, "link": o["link"]}
        rec.update({"t": o["titulo"], "tienda": o["tienda"], "cat": o["categoria"], "ultimo": day})
        if o["precio"] is not None:
            rec["precio"] = o["precio"]
        if o["grados"] is not None:
            rec["grados"] = max(o["grados"], rec.get("grados") or o["grados"])
        seen[o["id"]] = rec
        if o["precio"] is None:
            continue
        key = title_key(o["titulo"])
        entries = prices.setdefault(key, [])
        if not any(e["id"] == o["id"] and e["precio"] == o["precio"] for e in entries):
            entries.append({"id": o["id"], "precio": o["precio"], "fecha": day})
            prices[key] = entries[-MAX_PRICES:]
    if save:
        storage.save(path, seen)
        storage.save(PRICES_FILE, prices)
    return before


def seen_before(prices_before, offer):
    """Lo más barato que se vio la misma cosa antes: {"precio", "fecha"} o None."""
    entries = [e for e in prices_before.get(title_key(offer["titulo"]), [])
               if not (e["id"] == offer["id"] and e["precio"] == offer["precio"])]
    if not entries:
        return None
    low = min(entries, key=lambda e: (e["precio"], e["fecha"]))
    return {"precio": low["precio"], "fecha": low["fecha"]}
