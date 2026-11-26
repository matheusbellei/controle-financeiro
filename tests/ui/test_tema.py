from harness import UITest

CLARO = 'rgb(245, 235, 221)'   # --creme
ESCURO = 'rgb(24, 18, 14)'     # fundo do tema escuro


class Tema(UITest):
    def fundo(self):
        return self.page.evaluate("getComputedStyle(document.body).backgroundColor")

    def cor_barra_status(self):
        return self.page.get_attribute('meta[name="theme-color"]', 'content')

    def test_automatico_segue_o_celular(self):
        self.login()
        self.assertEqual(self.fundo(), CLARO)
        self.page.emulate_media(color_scheme='dark')
        self.assertEqual(self.fundo(), ESCURO)
        # o aviso de troca de tema do sistema chega um instante depois
        self.page.wait_for_function("document.querySelector('meta[name=\"theme-color\"]').content === '#2B1E16'")

    def test_escolher_escuro_fica_lembrado(self):
        self.login()
        self.go('config')
        self.assertEqual(self.page.get_attribute('#tema-opcoes [data-tema="auto"]', 'aria-pressed'), 'true')
        self.page.click('#tema-opcoes [data-tema="escuro"]')
        self.assertEqual(self.page.get_attribute('html', 'data-tema'), 'escuro')
        self.assertEqual(self.fundo(), ESCURO)
        self.assertEqual(self.cor_barra_status(), '#2B1E16')
        self.page.reload(); self.pronto()
        self.assertEqual(self.fundo(), ESCURO)
        self.go('config')
        self.assertEqual(self.page.get_attribute('#tema-opcoes [data-tema="escuro"]', 'aria-pressed'), 'true')

    def test_claro_vale_mesmo_com_o_celular_no_escuro(self):
        self.page.emulate_media(color_scheme='dark')
        self.login()
        self.go('config')
        self.page.click('#tema-opcoes [data-tema="claro"]')
        self.assertEqual(self.fundo(), CLARO)
        self.assertEqual(self.cor_barra_status(), '#3B2416')
        self.page.click('#tema-opcoes [data-tema="auto"]')
        self.assertEqual(self.fundo(), ESCURO)

    def test_tela_de_login_ja_abre_no_tema(self):
        self.open()
        self.page.evaluate("localStorage.setItem('tema', 'escuro')")
        self.page.reload()
        self.page.wait_for_selector('#tela-login')
        self.assertEqual(self.fundo(), ESCURO)
