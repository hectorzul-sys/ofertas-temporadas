"""Peticiones con pausas (clase Http copiada del monitor K-pop)."""

import random
import time

import requests

# Identificador honesto: quién lee y dónde preguntar.
USER_AGENT = "ofertas-temporadas/1.0 (bot familiar personal, 1 lectura por hora; +https://github.com/hectorzul-sys/ofertas-temporadas)"


class Http:
    def __init__(self, delay_seconds=(1, 2), timeout=30):
        self.delay = delay_seconds
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/xml"})
        self.first = True
        self.request_count = 0

    def get(self, url):
        if not self.first:
            time.sleep(random.uniform(*self.delay))
        self.first = False
        self.request_count += 1
        resp = self.session.get(url, timeout=self.timeout, allow_redirects=True)  # /rss/hot → /rss/tendencias
        resp.raise_for_status()
        return resp

    def get_text(self, url):
        return self.get(url).text
