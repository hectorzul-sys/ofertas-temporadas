"""Lector del RSS de Promodescuentos.

Dos feeds, 1 lectura de cada uno por corrida:
- tendencias: las que la comunidad está calentando; el título empieza con los grados ("118° - Amazon: …").
- todas: lo recién publicado, todavía sin grados (sirve para la lista de productos).
De cada oferta se guardan solo datos cortos; el enlace siempre es a su página en Promodescuentos.
"""

import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

FEEDS = {
    "tendencias": "https://www.promodescuentos.com/rss/tendencias",
    "todas": "https://www.promodescuentos.com/rss/todas",
}
PEPPER = "{http://www.pepper.com/rss}merchant"
TITLE_MAX = 120
GRADOS_RE = re.compile(r"^\s*(-?\d[\d,.]*)\s*°\s*-\s*")
ID_RE = re.compile(r"-(\d+)/?$")


def parse_price(text):
    """'$7,467' -> 7467.0 · '$1,299.50' -> 1299.5 · None si no hay precio."""
    if not text:
        return None
    digits = re.sub(r"[^\d.]", "", text.replace(",", ""))
    try:
        return float(digits) if digits else None
    except ValueError:
        return None


def parse(xml_text, source):
    """Texto del RSS -> lista de ofertas {id, titulo, grados, tienda, precio, categoria, link, fecha, fuente}."""
    root = ET.fromstring(xml_text)
    items = []
    for it in root.iter("item"):
        link = (it.findtext("link") or "").strip()
        m = ID_RE.search(link)
        if not m:
            continue
        title = (it.findtext("title") or "").strip()
        grados = None
        g = GRADOS_RE.match(title)
        if g:
            grados = int(float(g.group(1).replace(",", "")))
            title = title[g.end():]
        merchant = it.find(PEPPER)
        date = it.findtext("pubDate")
        try:
            fecha = parsedate_to_datetime(date).isoformat() if date else None
        except (TypeError, ValueError):
            fecha = None
        items.append({
            "id": m.group(1),
            "titulo": title[:TITLE_MAX],
            "grados": grados,
            "tienda": merchant.get("name") if merchant is not None else None,
            "precio": parse_price(merchant.get("price")) if merchant is not None else None,
            "categoria": (it.findtext("category") or "").strip() or None,
            "link": link,
            "fecha": fecha,
            "fuente": source,
        })
    return items


def merge(lists):
    """Une los feeds por id; los grados salen de tendencias."""
    out = {}
    for items in lists:
        for item in items:
            prev = out.get(item["id"])
            if prev is None:
                out[item["id"]] = dict(item)
                continue
            if item["grados"] is not None and (prev["grados"] or -10**9) < item["grados"]:
                prev["grados"] = item["grados"]
                prev["fuente"] = item["fuente"]
            for key in ("tienda", "precio", "categoria"):
                prev[key] = prev[key] if prev[key] is not None else item[key]
    return list(out.values())


def fetch(http):
    """-> (ofertas, errores). Si un feed falla, sigue con el otro."""
    lists, errors = [], []
    for source, url in FEEDS.items():
        try:
            items = parse(http.get_text(url), source)
            if not items:
                raise ValueError("el feed vino vacío")
            lists.append(items)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{source}: {type(exc).__name__}: {str(exc)[:150]}")
    return merge(lists), errors
