"""Confere no Chrome que o app registra o service worker e abre sem internet (como depois de instalado)."""
import functools, http.server, pathlib, threading, unittest
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]

class PWA(unittest.TestCase):
    def test_registra_e_abre_offline(self):
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{httpd.server_address[1]}/'
        try:
            with sync_playwright() as pw:
                b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
                ctx = b.new_context()
                page = ctx.new_page()
                page.goto(base)
                ok = page.evaluate("navigator.serviceWorker.ready.then((r) => !!r.active)")
                self.assertTrue(ok)
                manifest = page.evaluate("fetch('manifest.json').then((r) => r.json()).then((m) => m.short_name)")
                self.assertEqual(manifest, 'Finanças pessoais')
                page.reload()
                self.assertTrue(page.evaluate("!!navigator.serviceWorker.controller"))
                ctx.set_offline(True)
                page.reload()
                self.assertEqual(page.title(), 'Controle de Finanças Pessoais')
                b.close()
        finally:
            httpd.shutdown(); httpd.server_close()
