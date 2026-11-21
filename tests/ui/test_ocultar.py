from harness import UITest


class OcultarValores(UITest):
    def preparar(self):
        self.login()
        self.seed('tags', [dict(name='Mercado', color='#C68B59', icon='shopping-cart', parent_id=None, archived=False, created_by='u1')])
        tag = self.db('tags')[0]['id']
        self.seed('budgets', [dict(owner_id='u1', tag_id=tag, monthly_cents=80000)])
        self.seed('transactions', [dict(owner_id='u1', kind='gasto', amount_cents=12345, description='Feira', purchase_date='2026-11-01',
                                        competence_date='2026-11-01', tag_id=tag, payment='pix')])
        self.page.reload(); self.pronto()

    def borrado(self, sel):
        return self.page.eval_on_selector(sel, "e => getComputedStyle(e).filter").startswith('blur')

    def test_olho_desfoca_valores_e_mantem_limites(self):
        self.preparar()
        p = self.page
        self.assertFalse(self.borrado('#resumo-saiu .num'))
        p.click('#olho')
        self.assertEqual(p.get_attribute('#olho', 'aria-pressed'), 'true')
        for sel in ['#resumo-saiu .num', '#resumo-entrou .num', '#resumo-livre .num', '#lista-mes .num']:
            self.assertTrue(self.borrado(sel), sel)
        self.assertTrue(self.borrado('#resumo-filtro'))
        # o limite do orçamento continua legível
        self.assertIn('800,00', p.inner_text('#tela-mes'))
        self.assertFalse(self.borrado('.lim'))
        # outras telas também
        self.go('ano')
        self.assertTrue(self.borrado('#tela-ano .num'))

    def test_lembra_depois_de_recarregar_e_volta_a_mostrar(self):
        self.preparar()
        p = self.page
        p.click('#olho')
        p.reload(); self.pronto()
        self.assertTrue(self.borrado('#resumo-saiu .num'))
        p.click('#olho')
        self.assertEqual(p.get_attribute('#olho', 'aria-pressed'), 'false')
        self.assertFalse(self.borrado('#resumo-saiu .num'))
