"""Formato de los mensajes y envío por Telegram (envío, troceo y resumen copiados del monitor K-pop)."""

import html
import re
import time
from datetime import date
from urllib.parse import quote

import requests

MAX_LEN = 4000  # Telegram corta en 4096
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
PROFECO = "https://qqp.profeco.gob.mx/"


def _a(url, text):
    return f'<a href="{html.escape(url, quote=True)}">{text}</a>'


def _money(value):
    return f"${value:,.0f}" if value == int(value) else f"${value:,.2f}"


def _day(iso):
    d = date.fromisoformat(iso[:10])
    return f"{d.day}-{MESES[d.month - 1]}"


def is_amazon(offer):
    return "amazon" in (offer.get("tienda") or "").lower()


def keepa_url(offer, producto=None):
    """Gráfica del ASIN si la lista lo trae; si no, búsqueda en Keepa de Amazon México (dominio 11)."""
    asin = (producto or {}).get("keepa")
    if asin:
        return f"https://keepa.com/#!product/11-{asin}"
    q = re.sub(r"^[^:]{1,25}:\s*", "", offer["titulo"])  # sin "Amazon:" al inicio
    q = re.sub(r"\([^)]*\)|\|.*$", " ", q)
    q = " ".join(re.sub(r"[^\w\s]", " ", q).split()[:6])
    return f"https://keepa.com/#!search/11-{quote(q)}"


# --- aviso al momento --------------------------------------------------------

def header(alert):
    if alert["tipo"] == "producto":
        return f"🎯 <b>{html.escape(alert['producto']['nombre'].upper())} A TU PRECIO</b>"
    return f"🏷️ <b>OFERTA · {html.escape(alert['categoria'].upper())}</b>"


def format_alert(alert, caro=3000):
    o = alert["oferta"]
    lines = [header(alert), f"<b>{html.escape(o['titulo'])}</b>"]
    price = f"💰 <b>{_money(o['precio'])}</b>" if o["precio"] is not None else "💰 precio en la página"
    if o.get("tienda"):
        price += f" · 🏬 {html.escape(o['tienda'])}"
    lines.append(price)
    if alert["tipo"] == "producto":
        lines.append(f"🎯 Querías pagar {_money(alert['producto']['precio_objetivo'])} o menos")
    if o["grados"] is not None:
        lines.append(f"🔥 {o['grados']}° en Promodescuentos")
    elif alert["tipo"] == "producto":
        lines.append("🆕 Recién publicada (todavía sin votos)")
    if (b := alert.get("antes")):
        if o["precio"] is not None and o["precio"] < b["precio"]:
            lines.append(f"📉 Más barato que antes: la vimos a {_money(b['precio'])} el {_day(b['fecha'])}")
        else:
            lines.append(f"📊 Visto antes a {_money(b['precio'])} el {_day(b['fecha'])}")
    if is_amazon(o):
        lines.append("📈 Revisa en Keepa si de verdad es su precio bajo")
    if o["precio"] is not None and o["precio"] >= caro:
        lines.append(f"💡 Es caro: compáralo antes en {_a(PROFECO, 'Profeco (Quién es Quién en los Precios)')}")
    return "\n".join(lines)


def buttons(alert):
    o = alert["oferta"]
    row = [{"text": "Ver en Promodescuentos", "url": o["link"]}]
    if is_amazon(o):
        row.append({"text": "📈 Keepa", "url": keepa_url(o, alert.get("producto"))})
    return {"inline_keyboard": [row]}


# --- resumen -------------------------------------------------------------------

def compact(o, extra=""):
    first = _a(o["link"], html.escape(o["titulo"]))
    parts = [f"<b>{_money(o['precio'])}</b>" if o["precio"] is not None else "precio en la página"]
    if o.get("tienda"):
        parts.append(f"🏬 {html.escape(o['tienda'])}")
    if o["grados"] is not None:
        parts.append(f"🔥 {o['grados']}°")
    if is_amazon(o):
        parts.append(_a(keepa_url(o), "📈 Keepa"))
    if extra:
        parts.append(extra)
    return f"• {first}\n    " + " · ".join(parts)


def split_messages(blocks, separator="\n\n"):
    messages, current = [], ""
    for block in blocks:
        if current and len(current) + len(block) + len(separator) > MAX_LEN:
            messages.append(current)
            current = ""
        current = f"{current}{separator}{block}" if current else block
    if current:
        messages.append(current)
    return messages


def build_digest(sections, title, notes=()):
    """sections: [(titulo, [lineas compactas], total)] -> mensajes."""
    blocks = [title]
    for section_title, lines, total in sections:
        if not lines:
            continue
        extra = f"\n<i>…y {total - len(lines)} más</i>" if total > len(lines) else ""
        blocks.append(f"<b>{section_title}</b> ({total})\n\n" + "\n\n".join(lines) + extra)
    if len(blocks) == 1:
        blocks.append("Hoy no hubo ofertas de nuestras categorías. 😴")
    blocks += list(notes)
    return split_messages(blocks)


# --- envío -------------------------------------------------------------------

class TelegramNotifier:
    def __init__(self, token, chat_id):
        self.url = f"https://api.telegram.org/bot{token}/sendMessage"
        self.chat_id = chat_id

    def send(self, text, reply_markup=None):
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup
        resp = requests.post(self.url, json=payload, timeout=30)
        if resp.status_code == 429:
            time.sleep(resp.json().get("parameters", {}).get("retry_after", 5))
            return self.send(text, reply_markup)
        if not resp.ok:
            # No incluimos la URL: lleva el token.
            raise RuntimeError(f"Telegram respondió {resp.status_code}: {resp.text[:300]}")
        time.sleep(1)

    def send_alert(self, alert, caro=3000):
        self.send(format_alert(alert, caro), buttons(alert))

    def send_many(self, messages):
        for text in messages:
            self.send(text)
