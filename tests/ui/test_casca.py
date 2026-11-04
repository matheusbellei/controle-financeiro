from harness import UITest

class Casca(UITest):
    def test_senha_errada_mostra_mensagem(self):
        self.open()
        p = self.page
        p.fill('#login-email', 'matheus@x.com'); p.fill('#login-senha', 'errada'); p.click('#login-entrar')
        self.assertIn('E-mail ou senha incorretos.', p.inner_text('#login-erro'))
        self.assertFalse(p.is_visible('#tela-mes'))

    def test_login_abre_o_mes_atual(self):
        self.login()
        self.assertIn('Novembro 2026', self.page.inner_text('#mes-titulo'))

    def test_recarregar_mantem_login(self):
        self.login()
        self.page.reload()
        self.page.wait_for_selector('#tela-mes', state='visible')

    def test_menu_tem_todas_as_telas_e_sair(self):
        self.login()
        p = self.page
        p.click('#menu-botao')
        for t in ['mes', 'dashboards', 'ano', 'metas', 'recorrentes', 'tags', 'config']:
            self.assertTrue(p.is_visible(f'[data-tela="{t}"]'), t)
        p.click('#menu-sair')
        p.wait_for_selector('#tela-login', state='visible')

    def test_navega_pelo_menu(self):
        self.login()
        self.go('tags')
        self.assertFalse(self.page.is_visible('#tela-mes'))

    def test_nome_do_app(self):
        self.open()
        self.page.wait_for_selector('#tela-login', state='visible')
        self.assertEqual(self.page.title(), 'Controle de Finanças Pessoais')
        self.assertIn('Controle de Finanças Pessoais', self.page.inner_text('#tela-login'))
        self.assertNotIn('Café', self.page.content())
