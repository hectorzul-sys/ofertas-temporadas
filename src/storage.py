"""Lectura/escritura de los JSON de estado (copiado del monitor K-pop, más cifrado).

Se escriben ordenados, para que si nada cambió el archivo quede idéntico y el workflow no haga commit.

El repo es público y los términos de Promodescuentos prohíben reproducir su contenido en otros
sitios sin permiso, así que lo guardado en `data/` va cifrado con la clave `DATOS_CLAVE`
(secreto de GitHub; en el PC, archivo `.clave` fuera de git). Sin clave se guarda en claro
(solo para pruebas locales). Como el cifrado cambia en cada escritura, solo se reescribe el
archivo si el contenido de verdad cambió.
"""

import json
import os
from pathlib import Path

from cryptography.fernet import Fernet

_KEY_FILE = Path(__file__).resolve().parent.parent / ".clave"


def _fernet():
    key = os.environ.get("DATOS_CLAVE")
    if not key and _KEY_FILE.exists():
        key = _KEY_FILE.read_text(encoding="utf-8").strip()
    return Fernet(key.encode()) if key else None


def _dump(data):
    return json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _read(path):
    """Contenido en claro del archivo (cifrado `.enc` si hay clave) o None."""
    p = Path(path)
    f = _fernet()
    enc = p.with_name(p.name + ".enc")
    if f and enc.exists():
        return f.decrypt(enc.read_bytes()).decode("utf-8")
    if p.exists():
        return p.read_text(encoding="utf-8")
    return None


def load(path, default):
    text = _read(path)
    return default if text is None else json.loads(text)


def save(path, data):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    text = _dump(data)
    if _read(p) == text:
        return
    f = _fernet()
    target, payload = (p.with_name(p.name + ".enc"), f.encrypt(text.encode("utf-8"))) if f else (p, text.encode("utf-8"))
    tmp = target.with_suffix(".tmp")
    tmp.write_bytes(payload)
    tmp.replace(target)
