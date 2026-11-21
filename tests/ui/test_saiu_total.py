from harness import UITest


class SaiuSomaTudo(UITest):
    def preparar(self):
        self.login()
        base = dict(owner_id='u1', purchase_date='2026-11-01', competence_date='2026-11-01', payment='pix')
        self.seed('transactions', [dict(base, kind='receita', amount_cents=476724, description='Salário'),
                                   dict(base, kind='gasto', amount_cents=330094, description='Contas'),
                                   dict(base, kind='investimento', amount_cents=140000, description='Tesouro'),
                                   dict(base, kind='doacao', amount_cents=1000, description='Igreja')])
        self.page.reload(); self.pronto()

    def t(self, sel):
        return self.page.inner_text(sel).replace('\xa0', ' ')

    def test_mes_saiu_e_a_soma_e_vem_depois_de_investido_e_doacoes(self):
        self.preparar()
        rotulos = self.page.eval_on_selector_all('#tela-mes .resumo .rotulo', 'els => els.map(e => e.textContent)')
        self.assertEqual(rotulos[:5], ['Entrou', 'Investido', 'Doações', 'Saiu', 'Livre planejado'])
        self.assertIn('R$ 4.710,94', self.t('#resumo-saiu'))
        self.assertIn('só gastos R$ 3.300,94', self.t('#resumo-so-gastos'))
        self.assertIn('R$ 56,30', self.t('#resumo-livre'))  # entrou − saiu

    def test_ano_soma_igual(self):
        self.preparar()
        self.go('ano')
        rotulos = self.page.eval_on_selector_all('#tela-ano .resumo .rotulo', 'els => els.map(e => e.textContent)')
        self.assertEqual(rotulos, ['Entrou no ano', 'Investido no ano', 'Doado no ano', 'Saiu no ano', 'Livre no ano'])
        self.assertIn('R$ 4.710,94', self.t('#ano-saiu'))
        nov = self.t('#grade-ano .mes-ano[data-mes="11"]')
        self.assertIn('Saiu R$ 4.710,94', nov)
        self.assertIn('Livre R$ 56,30', nov)
