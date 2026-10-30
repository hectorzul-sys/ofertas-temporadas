"""Bot de ofertas de temporada: lee Promodescuentos, filtra y avisa por Telegram.

  python -m src.main                 una corrida normal (la pide el despertador cada hora)
  python -m src.main --digest-now    manda el resumen diario aunque no sea la hora
  python -m src.main --dry-run       muestra lo que mandaría, sin enviar ni guardar
  python -m src.main --test-telegram mensaje de prueba con una oferta real
  python -m src.main --get-chat-id   lista los chats que le escribieron al bot
  python -m src.main --conectar URL  manda los mensajes del bot al contestador (worker de Cloudflare)
  python -m src.main --desconectar   el bot deja de contestar preguntas (vuelve a funcionar --get-chat-id)
"""

import argparse
import logging
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
import yaml

from . import feed, filtro, historial, storage
from .notifier import MESES, TelegramNotifier, build_digest, compact
from .web import Http

log = logging.getLogger("temporadas")
STATE_FILE = "data/estado.json"
MIN_GAP = timedelta(minutes=45)  # 1 lectura por hora aunque lleguen dos disparos seguidos
FAILS_TO_WARN = 3  # corridas seguidas sin poder leer antes de avisar al momento


def load_config(path="categorias.yaml"):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_products(path="productos.yaml"):
    """Lista privada: archivo local o el secreto PRODUCTOS (mismo formato)."""
    text = Path(path).read_text(encoding="utf-8") if Path(path).exists() else os.environ.get("PRODUCTOS", "")
    data = yaml.safe_load(text) if text.strip() else None
    return (data or {}).get("productos") or []


def new_day(today):
    return {"fecha": today.isoformat(), "avisos": [], "candidatos": {}, "errores": [], "vistas": 0}


def snapshot(offer, c):
    keep = ("id", "titulo", "grados", "tienda", "precio", "categoria", "link")
    snap = {k: offer[k] for k in keep}
    snap["grupo"] = c["producto"]["nombre"] if c["producto"] else c["categoria"]
    snap["tipo"] = c["tipo"]
    return snap


def plan_alerts(offers, cfg, productos, state, today, prices_before):
    """-> (avisos al momento, candidatos al resumen). Aplica tope, no repetir y orden por grados."""
    day = state["dia"]
    cap = filtro.daily_cap(cfg, today)
    used = sum(1 for a in day["avisos"] if a["tipo"] == "aviso")
    alerts = []
    ordered = sorted(offers, key=lambda o: -(o["grados"] or 0))
    for o in ordered:
        c = filtro.classify(o, cfg, productos)
        if not c:
            continue
        if c["tipo"] in ("producto", "aviso") and filtro.should_alert(state["enviados"], o, today, cfg):
            if c["tipo"] == "producto" or used < cap:
                used += c["tipo"] == "aviso"
                alerts.append({**c, "oferta": o, "antes": historial.seen_before(prices_before, o)})
                continue
        if any(a["id"] == o["id"] for a in day["avisos"]):
            continue
        prev = day["candidatos"].get(o["id"])
        snap = snapshot(o, c)
        if prev and (prev.get("grados") or 0) > (snap.get("grados") or 0):
            snap["grados"] = prev["grados"]
        day["candidatos"][o["id"]] = snap
    return alerts


def digest_due(now, cfg, last_sent):
    hour, minute = map(int, cfg["general"]["resumen_hora"].split(":"))
    return last_sent != now.date().isoformat() and (now.hour, now.minute) >= (hour, minute)


def digest_messages(cfg, day, state):
    d = date.fromisoformat(day["fecha"])
    title = f"📋 <b>Resumen de ofertas · {d.day} {MESES[d.month - 1]}</b>"
    if (s := filtro.season(cfg, d)):
        title += f"\n🛍️ Hoy es {s}"
    products = [a for a in day["avisos"] if a["tipo"] == "producto"]
    alerts = [a for a in day["avisos"] if a["tipo"] == "aviso"]
    sent_ids = {a["id"] for a in day["avisos"]}
    rest = sorted((c for i, c in day["candidatos"].items() if i not in sent_ids), key=lambda c: -(c.get("grados") or 0))
    limit = cfg["general"].get("resumen_max", 15)
    sections = [
        ("🎯 Tus productos a su precio", [compact(a, f"🎯 {a['grupo']}") for a in products], len(products)),
        ("🏷️ Avisos de hoy", [compact(a, a["grupo"]) for a in alerts], len(alerts)),
        ("⭐ Lo mejor del día en nuestras categorías", [compact(c, c["grupo"]) for c in rest[:limit]], len(rest)),
    ]
    notes = [f"<i>👀 Hoy revisé {day['vistas']} ofertas de Promodescuentos. Grados = votos de la comunidad; "
             "en Amazon revisa Keepa antes de comprar.</i>"]
    if day["errores"]:
        notes.append(f"⚠️ <b>Hoy no pude leer Promodescuentos {len(day['errores'])} veces</b> "
                     f"(último error: {day['errores'][-1][:120]}).")
    return build_digest(sections, title, notes)


def telegram_from_env():
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()  # el secreto puede traer un salto de línea
    chat_id = (os.environ.get("TELEGRAM_CHAT_ID") or "").strip()
    if not token or not chat_id:
        return None
    return TelegramNotifier(token, chat_id)


def send_test(cfg, productos):
    notifier = telegram_from_env() or sys.exit("Faltan TELEGRAM_BOT_TOKEN y/o TELEGRAM_CHAT_ID")
    notifier.send("✅ Bot de ofertas de temporada conectado. Aquí llegarán los avisos y el resumen de las 21:00.")
    offers, errors = feed.fetch(Http())
    hot = sorted((o for o in offers if o["grados"] is not None), key=lambda o: -o["grados"])
    if hot:
        o = hot[0]
        c = filtro.classify(o, cfg, productos) or {"tipo": "aviso", "categoria": o["categoria"] or "General", "producto": None}
        notifier.send("🧪 <i>Así se ve un aviso (ejemplo con la oferta más caliente de ahora):</i>")
        notifier.send_alert({**c, "oferta": o, "antes": None}, cfg["general"].get("caro_profeco", 3000))
    elif errors:
        notifier.send(f"⚠️ No pude leer Promodescuentos: {errors[0][:200]}")
    print("Mensaje de prueba enviado.")


def get_chat_id():
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip() or sys.exit("Falta TELEGRAM_BOT_TOKEN")
    resp = requests.get(f"https://api.telegram.org/bot{token}/getUpdates", timeout=30)
    resp.raise_for_status()
    chats = {}
    for update in resp.json().get("result", []):
        chat = (update.get("message") or update.get("my_chat_member") or {}).get("chat")
        if chat:
            chats[chat["id"]] = chat.get("username") or chat.get("title") or chat.get("first_name")
    if not chats:
        print("No hay mensajes. Escríbele algo al bot (o en el grupo) y vuelve a correr esto.")
    for chat_id, who in chats.items():
        print(f"TELEGRAM_CHAT_ID={chat_id}   ({who})")


def set_webhook(url):
    """Telegram manda cada mensaje del bot al contestador. Sin URL, lo desconecta."""
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip() or sys.exit("Falta TELEGRAM_BOT_TOKEN")
    payload = {"url": url or "", "allowed_updates": ["message"], "drop_pending_updates": True}
    if url:
        payload["secret_token"] = (os.environ.get("WEBHOOK_SECRETO") or "").strip() or sys.exit("Falta WEBHOOK_SECRETO")
    resp = requests.post(f"https://api.telegram.org/bot{token}/setWebhook", json=payload, timeout=30)
    if not resp.ok:
        sys.exit(f"Telegram respondió {resp.status_code}: {resp.text[:300]}")
    print("Contestador conectado." if url else "Contestador desconectado.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--digest-now", action="store_true")
    parser.add_argument("--test-telegram", action="store_true")
    parser.add_argument("--get-chat-id", action="store_true")
    parser.add_argument("--conectar", metavar="URL")
    parser.add_argument("--desconectar", action="store_true")
    parser.add_argument("--force", action="store_true", help="leer aunque la última lectura fue hace menos de 45 min")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    cfg = load_config()
    productos = load_products()
    if args.get_chat_id:
        return get_chat_id()
    if args.conectar or args.desconectar:
        return set_webhook(None if args.desconectar else args.conectar)
    if args.test_telegram:
        return send_test(cfg, productos)

    g = cfg["general"]
    now = datetime.now(ZoneInfo(g["zona"]))
    today = now.date()
    state = storage.load(STATE_FILE, {})
    state.setdefault("enviados", {})
    state.setdefault("dia", new_day(today))
    notifier = None if args.dry_run else telegram_from_env()
    if not notifier and not args.dry_run:
        log.warning("Sin TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID: solo guardo lo visto, no mando nada.")

    def deliver(messages=(), alert=None):
        if alert is not None:
            log.info("AVISO → %s | %s", alert["oferta"]["titulo"], alert["tipo"])
            if notifier:
                notifier.send_alert(alert, g.get("caro_profeco", 3000))
        for text in messages:
            log.info("MENSAJE →\n%s", text)
            if notifier:
                notifier.send(text)

    # Un día que se quedó sin resumen (p. ej. el bot no corrió a las 21:00): se manda tarde.
    if state["dia"]["fecha"] != today.isoformat():
        if state.get("ultimo_resumen") != state["dia"]["fecha"] and (state["dia"]["avisos"] or state["dia"]["candidatos"]):
            deliver(digest_messages(cfg, state["dia"], state))
            state["ultimo_resumen"] = state["dia"]["fecha"]
        state["dia"] = new_day(today)
    day = state["dia"]

    last = state.get("ultima_lectura")
    if args.force or args.dry_run or not last or now - datetime.fromisoformat(last) >= MIN_GAP:
        offers, errors = feed.fetch(Http())
        log.info("Leídas %d ofertas; errores: %s", len(offers), errors or "ninguno")
        day["errores"] = (day["errores"] + errors)[-10:]
        if offers:
            state["ultima_lectura"] = now.isoformat(timespec="minutes")
            state["fallos_seguidos"] = 0
            day["vistas"] = len(set(day.get("ids_vistas", [])) | {o["id"] for o in offers})
            day["ids_vistas"] = sorted(set(day.get("ids_vistas", [])) | {o["id"] for o in offers})
            prices_before = historial.record(offers, today, save=not args.dry_run)
            for alert in plan_alerts(offers, cfg, productos, state, today, prices_before):
                deliver(alert=alert)
                if notifier or args.dry_run:
                    filtro.mark_sent(state["enviados"], alert["oferta"], today)
                    day["avisos"].append(snapshot(alert["oferta"], alert))
        else:
            state["fallos_seguidos"] = state.get("fallos_seguidos", 0) + 1
            if state["fallos_seguidos"] >= FAILS_TO_WARN and state.get("fallo_avisado") != today.isoformat():
                deliver([f"⚠️ <b>No puedo leer Promodescuentos</b> desde hace {state['fallos_seguidos']} corridas. "
                         "Mientras, usa las alertas de su app y Keepa. Claude lo revisa."])
                state["fallo_avisado"] = today.isoformat()
    else:
        log.info("Última lectura %s: menos de 45 min, no vuelvo a leer.", last)

    if args.digest_now or digest_due(now, cfg, state.get("ultimo_resumen")):
        deliver(digest_messages(cfg, day, state))
        state["ultimo_resumen"] = today.isoformat()
        # Lo que llegue después del resumen ya no sale en el de mañana; los avisos siguen contando para el tope.
        state["dia"] = {**new_day(today), "avisos": day["avisos"], "ids_vistas": day.get("ids_vistas", []),
                        "vistas": day["vistas"]}

    state["enviados"] = filtro.prune_sent(state["enviados"], today, cfg)
    if not args.dry_run:
        storage.save(STATE_FILE, state)


if __name__ == "__main__":
    main()
