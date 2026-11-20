from harness import UITest

class Tags(UITest):
    def criar(self, nome, cor='#C68B59', icone='home', mae=None, limite=None):
        p = self.page
        if mae:
            self.go('tags'); self.nova_subtag(mae); p.fill('#subtag-nome', nome)
            p.click(f'.paleta [data-cor="{cor}"]'); p.click(f'.icones [data-icone="{icone}"]')
            p.click('#subtag-salvar'); p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
            self.go('tags'); return
        p.click('#tag-nova'); p.wait_for_selector('#tag-nome')
        p.fill('#tag-nome', nome)
        p.click(f'.paleta [data-cor="{cor}"]'); p.click(f'.icones [data-icone="{icone}"]')
        p.click('#tag-salvar'); p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()

    def tag(self, nome):
        return next(t for t in self.db('tags') if t['name'] == nome)

    def test_criar_tag_com_cor_e_icone(self):
        self.login(); self.go('tags')
        self.criar('Moradia', cor='#6F4E37', icone='home')
        self.assertIn('Moradia', self.page.inner_text('#lista-tags'))
        t = self.tag('Moradia')
        self.assertEqual((t['color'], t['icon'], t['parent_id']), ('#6F4E37', 'home', None))

    def test_subtag_aparece_no_formulario_de_lancamento(self):
        self.login(); self.go('tags')
        self.criar('Alimentação', icone='tools-kitchen-2'); self.criar('Mercado', icone='shopping-cart', mae='Alimentação')
        self.assertEqual(self.tag('Mercado')['parent_id'], self.tag('Alimentação')['id'])
        self.go('mes'); self.page.click('#novo-lancamento')
        self.page.select_option('#lanc-tag', label='Alimentação')
        self.assertIn('Mercado', self.page.inner_text('#lanc-subtag'))

    def test_renomear(self):
        self.login(); self.go('tags'); self.criar('Lazr')
        self.bloco('Lazr').locator('.tag-editar').click()
        self.page.fill('#tag-nome', 'Lazer'); self.page.click('#tag-salvar')
        self.page.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        self.assertEqual([t['name'] for t in self.db('tags')], ['Lazer'])

    def test_arquivar_tira_do_formulario_mas_mantem_historico(self):
        self.login(); self.go('tags'); self.criar('Academia')
        tid = self.tag('Academia')['id']
        self.seed('transactions', [dict(owner_id='u1', kind='gasto', amount_cents=9900, description='Mensalidade',
                                        purchase_date='2026-11-02', competence_date='2026-11-02', tag_id=tid, payment='pix')])
        self.bloco('Academia').locator('.tag-arquivar').click(); self.pronto()
        self.assertTrue(self.tag('Academia')['archived'])
        self.go('mes')
        self.assertIn('Academia', self.page.inner_text('#lista-mes'))
        self.page.click('#novo-lancamento')
        self.assertNotIn('Academia', self.page.inner_text('#lanc-tag'))

    def test_desarquivar(self):
        self.login(); self.go('tags'); self.criar('Viagem')
        linha = lambda: self.bloco('Viagem')
        linha().locator('.tag-arquivar').click(); self.pronto()
        linha().locator('.tag-arquivar').click(); self.pronto()
        self.assertFalse(self.tag('Viagem')['archived'])

    def test_subtag_nao_tem_limite_proprio(self):
        self.login(); self.go('tags'); self.criar('Alimentação')
        self.nova_subtag('Alimentação')
        self.assertEqual(self.page.locator('#modal #tag-orcamento, #modal #subtag-orcamento').count(), 0)

    def test_gasto_na_subtag_move_a_barra_da_mae_e_limite_dela_nao_soma(self):
        self.login(); self.go('tags')
        self.criar('Alimentação'); self.criar('Mercado', mae='Alimentação')
        ali, mer = self.tag('Alimentação')['id'], self.tag('Mercado')['id']
        self.seed('budgets', [dict(owner_id='u1', tag_id=ali, monthly_cents=100000)])
        self.seed('budgets', [dict(owner_id='u2', tag_id=ali, monthly_cents=50000)])
        self.seed('transactions', [dict(owner_id='u1', kind='gasto', amount_cents=125000, description='Feira',
                                        purchase_date='2026-11-02', competence_date='2026-11-02', tag_id=mer, payment='pix')])
        self.go('mes')
        self.assertEqual(self.page.locator(f'#orcamentos .orcamento[data-tag="{ali}"] .barra.estourou').count(), 1)
        self.assertIn('de R$ 1.000,00', self.page.inner_text(f'#orcamentos .orcamento[data-tag="{ali}"]').replace('\xa0', ' '))

    def test_nome_obrigatorio(self):
        self.login(); self.go('tags')
        self.page.click('#tag-nova'); self.page.click('#tag-salvar')
        self.assertIn('Dê um nome', self.page.inner_text('#tag-erro'))
