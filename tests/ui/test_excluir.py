from harness import UITest

class ExcluirTags(UITest):
    def preparar(self):
        self.login()
        self.seed('tags', [dict(name='Estética', color='#D81B60', icon='scissors', parent_id=None, archived=False, created_by='u1'),
                           dict(name='Lazer', color='#C68B59', icon='movie', parent_id=None, archived=False, created_by='u1')])
        self.t = {x['name']: x['id'] for x in self.db('tags')}
        self.seed('tags', [dict(name='Cabelo', color='#F48FB1', icon='cut', parent_id=self.t['Estética'], archived=False, created_by='u1')])
        self.t = {x['name']: x['id'] for x in self.db('tags')}
        self.seed('transactions', [dict(owner_id='u1', kind='gasto', amount_cents=5000, description='Corte', purchase_date='2026-11-03',
                                        competence_date='2026-11-03', tag_id=self.t['Cabelo'], payment='pix')])
        self.seed('budgets', [dict(owner_id='u1', tag_id=self.t['Estética'], monthly_cents=10000)])

    def test_excluir_tag_avisa_e_leva_subtags(self):
        self.preparar(); self.go('tags'); p = self.page
        self.bloco('Estética').locator('.bloco-topo .tag-excluir').click()
        aviso = p.inner_text('#modal')
        self.assertIn('1 subtag', aviso); self.assertIn('1 lançamento', aviso); self.assertIn('sem tag', aviso)
        p.click('#tag-excluir-confirmar'); p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        self.assertEqual([x['name'] for x in self.db('tags')], ['Lazer'])
        self.assertIsNone(self.db('transactions')[0]['tag_id'])
        self.assertEqual(self.db('budgets'), [])

    def test_cancelar_nao_exclui(self):
        self.preparar(); self.go('tags'); p = self.page
        self.bloco('Lazer').locator('.bloco-topo .tag-excluir').click()
        p.click('#tag-excluir-cancelar')
        self.assertEqual(len(self.db('tags')), 3)

    def test_excluir_subtag(self):
        self.preparar(); self.go('tags'); p = self.page
        self.linha_sub('Cabelo').locator('.tag-excluir').click()
        p.click('#tag-excluir-confirmar'); p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        self.assertEqual(sorted(x['name'] for x in self.db('tags')), ['Estética', 'Lazer'])
        self.assertIsNone(self.db('transactions')[0]['tag_id'])

    def test_arquivar_continua_disponivel(self):
        self.preparar(); self.go('tags')
        self.assertEqual(self.bloco('Lazer').locator('.bloco-topo .tag-arquivar').count(), 1)
