from harness import UITest

class ValorDasParcelas(UITest):
    def abrir(self, total='300', n='3'):
        p = self.page
        p.click('#novo-lancamento'); p.fill('#lanc-valor', total); p.fill('#lanc-data', '2026-10-28')
        p.click('[data-pag="credito"]'); p.select_option('#lanc-parcelas', n)

    def valores(self):
        return self.page.eval_on_selector_all('#lanc-parcelas-lista .parc-valor', 'xs => xs.map((x) => x.value)')

    def test_lista_aparece_com_divisao_igual_e_datas(self):
        self.login(); self.abrir()
        self.assertTrue(self.page.is_visible('#campo-parc-valores'))
        self.assertEqual(self.valores(), ['100,00', '100,00', '100,00'])
        txt = self.page.inner_text('#lanc-parcelas-lista')
        for d in ['10/11', '10/12', '10/01']: self.assertIn(d, txt)

    def test_some_com_uma_parcela_ou_fora_do_credito(self):
        self.login(); self.abrir(n='1')
        self.assertFalse(self.page.is_visible('#campo-parc-valores'))
        self.page.select_option('#lanc-parcelas', '2'); self.page.click('[data-pag="pix"]')
        self.assertFalse(self.page.is_visible('#campo-parc-valores'))

    def test_editar_uma_parcela_atualiza_o_total_e_salva_cada_valor(self):
        self.login(); self.abrir(); p = self.page
        p.fill('#lanc-parcelas-lista .parc-valor >> nth=1', '120')
        self.assertEqual(p.input_value('#lanc-valor'), '320,00')
        self.assertIn('R$ 320,00', p.inner_text('#lanc-parc-total').replace('\xa0', ' '))
        p.click('#lanc-salvar'); p.wait_for_selector('#modal-fundo', state='hidden')
        ts = sorted(self.db('transactions'), key=lambda t: t['installment_n'])
        self.assertEqual([t['amount_cents'] for t in ts], [10000, 12000, 10000])

    def test_digitar_na_parcela_coloca_virgula(self):
        self.login(); self.abrir(); p = self.page
        p.fill('#lanc-parcelas-lista .parc-valor >> nth=0', '')
        p.click('#lanc-parcelas-lista .parc-valor >> nth=0'); p.keyboard.type('15050')
        self.assertEqual(self.valores()[0], '150,50')

    def test_mudar_o_total_volta_a_dividir_igual(self):
        self.login(); self.abrir(); p = self.page
        p.fill('#lanc-parcelas-lista .parc-valor >> nth=1', '120')
        p.fill('#lanc-valor', '600')
        self.assertEqual(self.valores(), ['200,00', '200,00', '200,00'])

    def test_datas_seguem_a_fatura_escolhida(self):
        self.login(); self.abrir(); p = self.page
        p.fill('#lanc-fatura', '2026-11-25'); p.dispatch_event('#lanc-fatura', 'input')
        txt = p.inner_text('#lanc-parcelas-lista')
        for d in ['25/11', '25/12', '25/01']: self.assertIn(d, txt)

    def test_parcela_vazia_nao_salva(self):
        self.login(); self.abrir(); p = self.page
        p.fill('#lanc-parcelas-lista .parc-valor >> nth=2', '')
        p.click('#lanc-salvar')
        self.assertIn('valor de todas as parcelas', p.inner_text('#lanc-erro'))
        self.assertEqual(self.db('transactions'), [])
