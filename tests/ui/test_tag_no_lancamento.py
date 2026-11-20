from harness import UITest

class TagNoLancamento(UITest):
    def preparar(self):
        self.login()
        self.seed('tags', [dict(name='Academia', color='#5B7A3A', icon='barbell', parent_id=None, archived=False, created_by='u1'),
                           dict(name='Saúde', color='#B5543A', icon='pill', parent_id=None, archived=False, created_by='u1')])
        self.t = {x['name']: x['id'] for x in self.db('tags')}
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()
        p = self.page
        p.click('#novo-lancamento'); p.fill('#lanc-valor', '45'); p.fill('#lanc-desc', 'Corte de cabelo')

    def tag(self, nome):
        return next(x for x in self.db('tags') if x['name'] == nome)

    def test_criar_tag_sem_sair_do_lancamento(self):
        self.preparar(); p = self.page
        p.select_option('#lanc-tag', '__nova__')
        self.assertTrue(p.is_visible('#nova-tag-inline'))
        self.assertFalse(p.is_visible('#lanc-valor'))
        self.assertGreaterEqual(p.locator('#nova-tag-inline .paleta [data-cor]').count(), 40)
        self.assertGreaterEqual(p.locator('#nova-tag-inline .icones [data-icone]').count(), 150)
        self.assertEqual(p.locator('#nova-tag-inline #cor-livre').count(), 1)
        p.fill('#nt-nome', 'Estética')
        p.click('#nova-tag-inline .paleta [data-cor="#D81B60"]'); p.click('#nova-tag-inline .icones [data-icone="scissors"]')
        p.click('#nt-salvar')
        self.assertFalse(p.is_visible('#nova-tag-inline'))
        est = self.tag('Estética')
        self.assertEqual((est['color'], est['icon'], est['parent_id']), ('#D81B60', 'scissors', None))
        self.assertEqual(p.input_value('#lanc-valor'), '45,00')
        self.assertEqual(p.input_value('#lanc-desc'), 'Corte de cabelo')
        self.assertEqual(p.input_value('#lanc-tag'), est['id'])
        p.click('#lanc-salvar'); p.wait_for_selector('#modal-fundo', state='hidden')
        self.assertEqual(self.db('transactions')[0]['tag_id'], est['id'])

    def test_criar_subtag_sem_sair_do_lancamento(self):
        self.preparar(); p = self.page
        p.select_option('#lanc-tag', label='Saúde')
        self.assertTrue(p.is_visible('#lanc-subtag'))
        p.select_option('#lanc-subtag', '__nova__')
        self.assertEqual(p.input_value('#nt-tag'), self.t['Saúde'])
        p.fill('#nt-nome', 'Barbearia'); p.click('#nt-salvar')
        sub = self.tag('Barbearia')
        self.assertEqual(sub['parent_id'], self.t['Saúde'])
        self.assertEqual(p.input_value('#lanc-tag'), self.t['Saúde'])
        self.assertEqual(p.input_value('#lanc-subtag'), sub['id'])
        p.click('#lanc-salvar'); p.wait_for_selector('#modal-fundo', state='hidden')
        self.assertEqual(self.db('transactions')[0]['tag_id'], sub['id'])

    def test_subtag_pode_ir_para_outra_tag(self):
        self.preparar(); p = self.page
        p.select_option('#lanc-tag', label='Saúde'); p.select_option('#lanc-subtag', '__nova__')
        p.select_option('#nt-tag', label='Academia'); p.fill('#nt-nome', 'Corda'); p.click('#nt-salvar')
        self.assertEqual(p.input_value('#lanc-tag'), self.t['Academia'])
        self.assertEqual(p.input_value('#lanc-subtag'), self.tag('Corda')['id'])

    def test_voltar_mantem_tudo_e_nao_cria(self):
        self.preparar(); p = self.page
        p.select_option('#lanc-tag', label='Academia')
        p.select_option('#lanc-tag', '__nova__'); p.fill('#nt-nome', 'Teste'); p.click('#nt-cancelar')
        self.assertTrue(p.is_visible('#lanc-valor'))
        self.assertEqual(p.input_value('#lanc-tag'), self.t['Academia'])
        self.assertEqual(p.input_value('#lanc-valor'), '45,00')
        self.assertEqual(len(self.db('tags')), 2)

    def test_esc_no_painel_volta_ao_lancamento(self):
        self.preparar(); p = self.page
        p.select_option('#lanc-tag', '__nova__'); p.keyboard.press('Escape')
        self.assertFalse(p.is_visible('#nova-tag-inline'))
        self.assertTrue(p.is_visible('#lanc-valor'))

    def test_nome_obrigatorio(self):
        self.preparar(); p = self.page
        p.select_option('#lanc-tag', '__nova__'); p.click('#nt-salvar')
        self.assertIn('Dê um nome', p.inner_text('#nt-erro'))
        self.assertEqual(len(self.db('tags')), 2)

    def test_recorrente_tambem_cria_tag(self):
        self.login(); self.go('recorrentes'); p = self.page
        p.click('#rec-novo'); p.fill('#rec-valor', '100')
        p.select_option('#rec-tag', '__nova__'); p.fill('#nt-nome', 'Streaming'); p.click('#nt-salvar')
        self.assertEqual(p.input_value('#rec-tag'), self.tag('Streaming')['id'])
        self.assertEqual(p.input_value('#rec-valor'), '100,00')
