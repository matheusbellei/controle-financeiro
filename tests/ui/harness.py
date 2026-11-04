"""Abre o index.html num Chrome headless com Supabase/Chart.js simulados e banco em memória."""
import functools, http.server, pathlib, threading, unittest
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
MEM = (ROOT / 'tests/ui/memory-store.js').read_text()
CHART_STUB = """window.Chart = class { constructor(ctx, cfg) { cfg.__canvas = ctx && ctx.id; (window.__charts = window.__charts || []).filter((c) => c.__canvas !== cfg.__canvas); window.__charts = (window.__charts || []).filter((c) => c.__canvas !== cfg.__canvas); window.__charts.push(cfg); this.config = cfg; }
  destroy() { window.__charts = (window.__charts || []).filter((c) => c !== this.config); } update() {} };"""
SUPA_STUB = "window.supabase = { createClient() { return {}; } };"

class UITest(unittest.TestCase):
    TODAY = '2026-11-02'

    @classmethod
    def setUpClass(cls):
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        handler = functools.partial(Quiet, directory=str(ROOT))
        cls.httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.httpd.server_address[1]}/index.html'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--no-first-run'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.httpd.shutdown(); cls.httpd.server_close()

    def setUp(self):
        self.ctx = self.browser.new_context(viewport={'width': 390, 'height': 844}, locale='pt-BR', timezone_id='America/Sao_Paulo')
        self.errors = []
        self.ctx.set_default_timeout(4000)
        self.page = self.ctx.new_page()
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.on('dialog', lambda d: d.accept())
        def route(r):
            u = r.request.url
            if 'supabase' in u: return r.fulfill(body=SUPA_STUB, content_type='text/javascript')
            if 'chart' in u.lower(): return r.fulfill(body=CHART_STUB, content_type='text/javascript')
            if u.startswith('http://127.0.0.1'): return r.continue_()
            return r.fulfill(body='', content_type='text/css')
        self.page.route('**/*', route)
        self.page.add_init_script(f"""(() => {{ const T = new Date('{self.TODAY}T12:00:00-03:00').getTime();
          const D = Date; class FakeDate extends D {{ constructor(...a) {{ super(...(a.length ? a : [T])); }} static now() {{ return T; }} }};
          globalThis.Date = FakeDate; }})();""")
        self.page.add_init_script(MEM)

    def tearDown(self):
        self.ctx.close()
        self.assertEqual(self.errors, [], 'erros de JavaScript na página')

    def open(self):
        self.page.goto(self.base)

    def login(self, email='matheus@x.com', senha='senha123'):
        self.open()
        p = self.page
        p.fill('#login-email', email); p.fill('#login-senha', senha); p.click('#login-entrar')
        p.wait_for_selector('#tela-mes', state='visible')
        self.pronto()

    def pronto(self):
        self.page.wait_for_selector('body:not([data-carregando])', state='attached')

    def seed(self, table, rows):
        self.page.evaluate('([t, r]) => window.__memSeed(t, r)', [table, rows])

    def db(self, table):
        return self.page.evaluate('(t) => window.__memdb[t]', table)

    def go(self, tela):
        p = self.page
        p.click('#menu-botao'); p.click(f'[data-tela="{tela}"]')
        p.wait_for_selector(f'#tela-{tela}', state='visible')
        self.pronto()
