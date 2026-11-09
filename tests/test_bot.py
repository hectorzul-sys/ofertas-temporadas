import os
import tempfile
import unittest
from datetime import date
from pathlib import Path

from src import feed, filtro, historial, storage
from src.main import load_config, plan_alerts, new_day
from src.notifier import format_alert, keepa_url, build_digest

RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:pepper="http://www.pepper.com/rss" version="2.0"><channel>
<item><category><![CDATA[Hogar]]></category><pepper:merchant name="Amazon" price="$1,099"/>
<title><![CDATA[312° - Amazon: Freidora de aire 5 L Ejemplo]]></title>
<link>https://www.promodescuentos.com/ofertas/freidora-ejemplo-100</link><pubDate>Wed, 28 Oct 2026 22:27:32 -0600</pubDate></item>
<item><category><![CDATA[Hogar]]></category><pepper:merchant name="Walmart" price="$80"/>
<title><![CDATA[150° - Walmart: Tapete de baño]]></title>
<link>https://www.promodescuentos.com/ofertas/tapete-101</link><pubDate>Wed, 28 Oct 2026 21:00:00 -0600</pubDate></item>
<item><category><![CDATA[Tecnología]]></category><pepper:merchant name="Amazon" price="$1,050"/>
<title><![CDATA[Amazon: SSD Ejemplo 1 TB NVMe]]></title>
<link>https://www.promodescuentos.com/ofertas/ssd-102</link><pubDate>Wed, 28 Oct 2026 20:00:00 -0600</pubDate></item>
<item><category><![CDATA[Tecnología]]></category><pepper:merchant name="Mobo" price="$159"/>
<title><![CDATA[900° - Mobo: Funda para monitor]]></title></item>
<item><category><![CDATA[Tecnología]]></category><pepper:merchant name="Liverpool" price="$2,500"/>
<title><![CDATA[160° - Liverpool: Bocina Ejemplo]]></title>
<link>https://www.promodescuentos.com/ofertas/bocina-105</link></item>
<item><category><![CDATA[Tecnología]]></category><pepper:merchant name="Amazon" price="$900"/>
<title><![CDATA[170° - Amazon: Teclado Ejemplo]]></title>
<link>https://www.promodescuentos.com/ofertas/teclado-106</link></item>
<item><category><![CDATA[Salud y belleza]]></category><pepper:merchant name="Amazon" price="$90"/>
<title><![CDATA[700° - Amazon: Jabón líquido para lavadora]]></title>
<link>https://www.promodescuentos.com/ofertas/jabon-107</link></item>
<item><category><![CDATA[Tecnología]]></category><pepper:merchant name="Mobo" price="$159"/>
<title><![CDATA[900° - Mobo: Funda para monitor otra]]></title>
<link>https://www.promodescuentos.com/ofertas/funda-103</link><pubDate>Wed, 28 Oct 2026 20:00:00 -0600</pubDate></item>
<item><category><![CDATA[Viajes]]></category>
<title><![CDATA[50° - Vuelo barato]]></title>
<link>https://www.promodescuentos.com/ofertas/vuelo-104</link></item>
</channel></rss>"""

PRODUCTOS = [{"nombre": "SSD 1 TB", "palabras": ["ssd", "1tb"], "precio_objetivo": 1100}]
TODAY = date(2026, 10, 29)


class FeedTest(unittest.TestCase):
    def test_parse(self):
        items = {i["id"]: i for i in feed.parse(RSS, "tendencias")}
        self.assertEqual(items["100"]["grados"], 312)
        self.assertEqual(items["100"]["titulo"], "Amazon: Freidora de aire 5 L Ejemplo")
        self.assertEqual(items["100"]["precio"], 1099)
        self.assertEqual(items["100"]["tienda"], "Amazon")
        self.assertIsNone(items["102"]["grados"])
        self.assertIsNone(items["104"]["precio"])

    def test_merge_keeps_grados(self):
        a = [{"id": "1", "grados": None, "tienda": "X", "precio": 5, "categoria": "Hogar", "fuente": "todas"}]
        b = [{"id": "1", "grados": 120, "tienda": None, "precio": None, "categoria": None, "fuente": "tendencias"}]
        m = feed.merge([a, b])[0]
        self.assertEqual((m["grados"], m["precio"], m["tienda"]), (120, 5, "X"))


class FiltroTest(unittest.TestCase):
    def setUp(self):
        self.cfg = load_config()
        self.items = {i["id"]: i for i in feed.parse(RSS, "tendencias")}

    def test_word_variants(self):
        self.assertTrue(filtro.word_re("1tb").search("ssd 1 tb nvme"))
        self.assertTrue(filtro.word_re("hot wheels").search("hotwheels basicos"))
        self.assertFalse(filtro.word_re("lego").search("colegio"))

    def test_classify(self):
        c = lambda i: filtro.classify(self.items[i], self.cfg, PRODUCTOS)
        self.assertEqual(c("100")["tipo"], "aviso")       # palabra "freidora"
        self.assertEqual(c("101")["tipo"], "resumen")     # Hogar sin palabra: al resumen
        self.assertEqual(c("102")["tipo"], "producto")    # lista privada, sin grados
        self.assertIsNone(c("103"))                       # "funda" excluida en Tecnología
        self.assertIsNone(c("104"))                       # categoría que no seguimos
        self.assertEqual(c("105")["tipo"], "aviso")       # palabra "bocina"
        self.assertEqual(c("106")["tipo"], "resumen")     # Tecnología sin palabra
        self.assertIsNone(c("107"))                       # "jabón" excluido aunque diga "lavadora"

    def test_no_repeat(self):
        sent, o = {}, self.items["100"]
        self.assertTrue(filtro.should_alert(sent, o, TODAY, self.cfg))
        filtro.mark_sent(sent, o, TODAY)
        self.assertFalse(filtro.should_alert(sent, o, TODAY, self.cfg))
        cheaper = {**o, "id": "999", "precio": 1000}       # otra publicación, 9 % más barata
        self.assertTrue(filtro.should_alert(sent, cheaper, TODAY, self.cfg))
        self.assertTrue(filtro.should_alert(sent, o, date(2026, 11, 5), self.cfg))

    def test_cap_and_season(self):
        self.assertEqual(filtro.daily_cap(self.cfg, TODAY), 5)
        self.assertEqual(filtro.daily_cap(self.cfg, date(2026, 11, 14)), 10)

    def test_plan_alerts_respects_cap(self):
        offers = [{**self.items["100"], "id": str(n), "titulo": f"Amazon: Freidora modelo {n}"} for n in range(8)]
        offers.append(self.items["102"])
        state = {"enviados": {}, "dia": new_day(TODAY)}
        alerts = plan_alerts(offers, self.cfg, PRODUCTOS, state, TODAY, {})
        self.assertEqual(sum(a["tipo"] == "aviso" for a in alerts), 5)
        self.assertEqual(sum(a["tipo"] == "producto" for a in alerts), 1)
        self.assertEqual(len(state["dia"]["candidatos"]), 3)   # lo que no cupo va al resumen


class ListaTelegramTest(unittest.TestCase):
    """Cosas apuntadas con /quiero (el contestador las guarda con grupos, rango, excluir y para)."""
    TV = {"n": 1, "nombre": "Televisor 4k", "grupos": [["pantalla", "tv", "smart tv", "televisor"], ["4k", "uhd"]],
          "min": 5000, "max": 9000, "excluir": ["soporte", "funda"], "para": "papá"}
    VINIL = {"n": 2, "nombre": "Reproductor vinil", "grupos": [["tornamesa", "tocadiscos"]],
             "min": None, "max": None, "excluir": [], "para": None}

    def setUp(self):
        self.cfg = load_config()

    def offer(self, titulo, precio, n="1"):
        return {"id": n, "titulo": titulo, "precio": precio, "grados": None, "tienda": "Amazon",
                "categoria": None, "link": f"https://x/{n}"}

    def test_match(self):
        m = lambda t, p, item=self.TV: filtro.match_product(self.offer(t, p), [item], self.cfg["general"])
        self.assertTrue(m("Amazon: Pantallas TCL 55 4K", 7999))     # plural
        self.assertTrue(m("Samsung Smart TV UHD 50", 9000))          # en el límite
        self.assertFalse(m("Pantalla TCL 55 4K", 9001))
        self.assertFalse(m("Pantalla TCL 55 4K", 4999))
        self.assertFalse(m("Pantalla TCL 55 4K", None))
        self.assertFalse(m("Soporte para pantalla 4K", 6000))
        self.assertFalse(m("TV Hisense 43 Full HD", 6000))
        self.assertTrue(m("Tornamesa Audio-Technica", None, self.VINIL))   # sin rango: cualquier precio
        self.assertFalse(m("Tornamesa reacondicionada", 900, self.VINIL))  # excluir general
        tele = {**self.TV, "min": None, "max": None, "piso": 2000, "categoria": "tv"}   # cuestionario, "sin límite"
        self.assertTrue(m("Pantalla Sony 4K 65", 32999, tele))
        self.assertFalse(m("Control remoto pantalla 4K", 299, tele))          # el piso frena lo barato
        self.assertTrue(m("Tornamesa X", None, {**self.VINIL, "piso": None}))

    def test_message_and_cap(self):
        o = self.offer("Pantalla TCL 55 4K", 7999)
        text = format_alert({"tipo": "producto", "categoria": None, "producto": self.TV, "oferta": o, "antes": None})
        self.assertIn("TELEVISOR 4K A TU PRECIO", text)
        self.assertIn("Buscabas de $5,000 a $9,000", text)
        self.assertIn("Para papá", text)
        text = format_alert({"tipo": "producto", "categoria": None, "producto": self.VINIL,
                             "oferta": self.offer("Tornamesa X", 2000), "antes": None})
        self.assertIn("REPRODUCTOR VINIL DE TU LISTA", text)
        offers = [self.offer(f"Pantalla modelo {n} 4K", 6000 + n, str(n)) for n in range(5)]
        state = {"enviados": {}, "dia": new_day(TODAY)}
        alerts = plan_alerts(offers, self.cfg, [self.TV], state, TODAY, {})
        self.assertEqual(len(alerts), 3)                      # avisos_por_producto
        self.assertEqual(len(state["dia"]["candidatos"]), 2)  # el resto, al resumen
        self.assertEqual(state["dia"]["candidatos"]["4"]["grupo"], "Televisor 4k (para papá)")

    def test_old_list_still_works(self):
        o = self.offer("Amazon: SSD Ejemplo 1 TB NVMe", 1050)
        self.assertEqual(filtro.match_product(o, PRODUCTOS, self.cfg["general"])["nombre"], "SSD 1 TB")
        text = format_alert({"tipo": "producto", "categoria": None, "producto": PRODUCTOS[0], "oferta": o, "antes": None})
        self.assertIn("Querías pagar $1,100 o menos", text)

    def test_remote_list_falls_back(self):
        from unittest import mock
        import requests
        from src import main
        state = {"lista_telegram": [self.VINIL]}
        with mock.patch.dict(os.environ, {"CONTESTADOR_URL": "https://x", "WEBHOOK_SECRETO": "s"}):
            with mock.patch.object(main.requests, "get", side_effect=requests.ConnectionError("caído")):
                self.assertEqual(main.remote_products(state), [self.VINIL])  # usa la última guardada
            resp = mock.Mock(**{"json.return_value": {"items": [self.TV, {"n": 9}]}})
            with mock.patch.object(main.requests, "get", return_value=resp) as get:
                self.assertEqual(main.remote_products(state), [self.TV])     # ignora lo que no trae grupos
                self.assertEqual(get.call_args.kwargs["headers"]["X-Clave"], "s")
        self.assertEqual(state["lista_telegram"], [self.TV])


class HistorialYMensajesTest(unittest.TestCase):
    def test_seen_before_and_encryption(self):
        from cryptography.fernet import Fernet
        old = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            os.environ["DATOS_CLAVE"] = Fernet.generate_key().decode()
            try:
                o = {"id": "1", "titulo": "Amazon: Freidora X", "tienda": "Amazon", "categoria": "Hogar",
                     "precio": 1200.0, "grados": 200, "link": "https://x/1"}
                historial.record([o], date(2026, 10, 29))
                before = historial.record([{**o, "id": "2", "precio": 999.0}], date(2026, 11, 2))
                self.assertEqual(historial.seen_before(before, {**o, "id": "2", "precio": 999.0}),
                                 {"precio": 1200.0, "fecha": "2026-10-29"})
                self.assertTrue(Path("data/precios.json.enc").exists())
                self.assertFalse(Path("data/precios.json").exists())
                self.assertNotIn(b"Freidora", Path("data/vistos-2026-10.json.enc").read_bytes())
                mtime = Path("data/precios.json.enc").stat().st_mtime_ns
                storage.save("data/precios.json", storage.load("data/precios.json", {}))
                self.assertEqual(Path("data/precios.json.enc").stat().st_mtime_ns, mtime)  # sin cambios, no reescribe
            finally:
                del os.environ["DATOS_CLAVE"]
                os.chdir(old)

    def test_format(self):
        o = {"id": "1", "titulo": "Amazon: Freidora <X>", "tienda": "Amazon", "categoria": "Hogar",
             "precio": 3500.0, "grados": 200, "link": "https://x/1"}
        text = format_alert({"tipo": "aviso", "categoria": "Hogar", "producto": None, "oferta": o,
                             "antes": {"precio": 4000.0, "fecha": "2026-10-20"}})
        self.assertIn("&lt;X&gt;", text)
        self.assertIn("200°", text)
        self.assertIn("la vimos a $4,000 el 20-oct", text)
        self.assertIn("Profeco", text)
        self.assertIn("Keepa", text)
        self.assertTrue(keepa_url(o).startswith("https://keepa.com/#!search/11-"))
        self.assertEqual(keepa_url(o, {"keepa": "B0ABC"}), "https://keepa.com/#!product/11-B0ABC")

    def test_digest_empty(self):
        msgs = build_digest([("x", [], 0)], "Título")
        self.assertIn("no hubo", msgs[0])


if __name__ == "__main__":
    unittest.main()
