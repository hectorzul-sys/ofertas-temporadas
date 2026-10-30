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
        self.assertIsNone(c("101"))                       # Hogar sin palabra: ya no entra (29-oct)
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
