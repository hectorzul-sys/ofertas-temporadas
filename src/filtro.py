"""Qué ofertas nos sirven (categorias.yaml y productos.yaml) y el control para no repetir avisos.

`enviados` guarda {"<clave>": {"precio": p, "fecha": "AAAA-MM-DD"}} por id de la oferta y por
"clave de título" (la misma cosa publicada dos veces). Igual que en el monitor K-pop, solo se
vuelve a avisar si el precio baja todavía más (aquí: 5 % o más) o si ya pasaron los días de no repetir.
"""

import re
import unicodedata
from datetime import date


def normalize(text):
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text.lower()).strip()


def word_re(word):
    """'1tb' también encuentra '1 TB'; 'hot wheels' también 'hotwheels'. Palabra completa."""
    w = re.escape(normalize(word))
    w = re.sub(r"(\d)([a-z])", r"\1\\s*\2", w)
    w = w.replace(r"\ ", r"\s*")
    return re.compile(rf"(?<![a-z0-9]){w}(?![a-z0-9])")


def has_any(text, words):
    for word in words or []:
        if word_re(word).search(text):
            return word
    return None


def title_key(title):
    """'AMAZON: Freidora de Aire 5L (envío gratis)' -> 'freidora de aire 5l envio gratis'."""
    t = normalize(title)
    head, sep, rest = t.partition(":")
    if sep and len(head) <= 25:
        t = rest
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()[:60]


def match_product(offer, productos, general):
    text = normalize(offer["titulo"])
    if has_any(text, general.get("excluir")):
        return None
    for p in productos or []:
        if offer["precio"] is None or offer["precio"] > p["precio_objetivo"]:
            continue
        if all(word_re(w).search(text) for w in p["palabras"]):
            return p
    return None


def classify(offer, cfg, productos=()):
    """-> {"tipo": "producto"|"aviso"|"resumen", "categoria", "producto", "palabra"} o None."""
    general = cfg["general"]
    if (p := match_product(offer, productos, general)):
        return {"tipo": "producto", "categoria": None, "producto": p, "palabra": None}
    text = normalize(offer["titulo"])
    if has_any(text, general.get("excluir")):
        return None
    best = None
    for name, cat in cfg["categorias"].items():
        in_cat = offer["categoria"] in (cat.get("promodescuentos") or [])
        word = has_any(text, cat.get("palabras"))
        if not (in_cat or word) or has_any(text, cat.get("excluir")):
            continue
        min_g = cat.get("grados_minimos", general["grados_minimos"])
        if offer["grados"] is None or offer["grados"] < min_g:
            continue
        if cat.get("precio_max") and offer["precio"] is not None and offer["precio"] > cat["precio_max"]:
            continue
        hot = offer["grados"] >= general.get("grados_aviso_directo", 10**9)
        tipo = "aviso" if (word or hot) else "resumen"
        found = {"tipo": tipo, "categoria": name, "producto": None, "palabra": word}
        if best is None or (tipo == "aviso" and best["tipo"] != "aviso"):
            best = found
    return best


def season(cfg, today):
    for t in cfg["general"].get("temporadas") or []:
        if date.fromisoformat(str(t["desde"])) <= today <= date.fromisoformat(str(t["hasta"])):
            return t["nombre"]
    return None


def daily_cap(cfg, today):
    g = cfg["general"]
    return g["avisos_por_dia_temporada"] if season(cfg, today) else g["avisos_por_dia"]


def _repeat_ok(last, price, today, cfg):
    if last is None:
        return True
    g = cfg["general"]
    if (today - date.fromisoformat(last["fecha"])).days >= g["no_repetir_dias"]:
        return True
    if price is not None and last.get("precio") is not None:
        return price <= last["precio"] * (1 - g.get("baja_para_repetir", 5) / 100)
    return False


def should_alert(enviados, offer, today, cfg):
    """True si no se avisó ya (por id ni por título) en los últimos días, o si bajó más."""
    keys = [f"id:{offer['id']}", f"t:{title_key(offer['titulo'])}"]
    return all(_repeat_ok(enviados.get(k), offer["precio"], today, cfg) for k in keys)


def mark_sent(enviados, offer, today):
    for k in (f"id:{offer['id']}", f"t:{title_key(offer['titulo'])}"):
        enviados[k] = {"precio": offer["precio"], "fecha": today.isoformat()}


def prune_sent(enviados, today, cfg):
    keep = cfg["general"]["no_repetir_dias"] * 2
    return {k: v for k, v in enviados.items() if (today - date.fromisoformat(v["fecha"])).days <= keep}
