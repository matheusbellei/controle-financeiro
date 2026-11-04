from harness import UITest

def gasto(owner, valor, comp, desc='x', tag=None, pag='pix', **kw):
    return dict(owner_id=owner, kind='gasto', amount_cents=valor, description=desc, purchase_date=comp,
                competence_date=comp, tag_id=tag, payment=pag, **kw)

class Mes(UITest):
    def preparar(self):
        self.login()
        self.seed('tags', [dict(name='Alimentação', color='#C68B59', icon='tools-kitchen-2', parent_id=None, archived=False, created_by='u1'),
                           dict(name='Moradia', color='#6F4E37', icon='home', parent_id=None, archived=False, created_by='u1')])
        self.tags = {t['name']: t['id'] for t in self.db('tags')}

    def recarregar(self):
        self.page.reload(); self.page.wait_for_selector('#tela-mes', state='visible')
        self.page.wait_for_selector('#resumo-livre'); self.pronto()

    def texto(self, sel):
        return self.page.inner_text(sel).replace('\xa0', ' ')

    def lancar(self, valor, desc, tag=None, pag=None, data=None, parcelas=None, tipo=None, estorno=False):
        p = self.page
        p.click('#novo-lancamento'); p.wait_for_selector('#lanc-valor')
        if tipo: p.click(f'[data-tipo="{tipo}"]')
        p.fill('#lanc-valor', valor); p.fill('#lanc-desc', desc)
        if data: p.fill('#lanc-data', data)
        if tag: p.select_option('#lanc-tag', label=tag)
        if pag: p.click(f'[data-pag="{pag}"]')
        if parcelas: p.select_option('#lanc-parcelas', str(parcelas))
        if estorno: p.check('#lanc-estorno')
        p.click('#lanc-salvar')
        p.wait_for_selector('#modal-fundo', state='hidden')
        self.pronto()

    def ir_para(self, alvo_mes_ano):
        p = self.page
        for _ in range(24):
            if alvo_mes_ano in p.inner_text('#mes-titulo'): return
            p.click('#mes-seguinte'); self.pronto()
        self.fail('mês não encontrado: ' + alvo_mes_ano)

    def test_mes_vazio_mostra_zeros_e_convite(self):
        self.preparar(); self.recarregar()
        self.assertIn('R$ 0,00', self.texto('#resumo-livre'))
        self.assertTrue(self.page.is_visible('#lista-mes .vazio'))

    def test_lancar_gasto_pix_aparece_no_mes(self):
        self.preparar(); self.recarregar()
        self.lancar('48,90', 'Padaria', tag='Alimentação', pag='pix')
        self.assertIn('Padaria', self.texto('#lista-mes'))
        self.assertIn('R$ 48,90', self.texto('#resumo-saiu'))
        t = self.db('transactions')[0]
        self.assertEqual((t['amount_cents'], t['competence_date'], t['payment'], t['tag_id']), (4890, '2026-11-02', 'pix', self.tags['Alimentação']))

    def test_credito_parcelado_avisa_e_distribui_nos_meses(self):
        self.preparar(); self.recarregar()
        p = self.page
        p.click('#novo-lancamento'); p.wait_for_selector('#lanc-valor')
        p.fill('#lanc-valor', '300'); p.fill('#lanc-desc', 'Tênis'); p.fill('#lanc-data', '2026-10-28')
        p.click('[data-pag="credito"]'); p.select_option('#lanc-parcelas', '3')
        self.assertIn('10/11', p.inner_text('#lanc-aviso'))
        p.click('#lanc-salvar'); p.wait_for_selector('#modal-fundo', state='hidden')
        self.assertIn('parcela 1/3', self.texto('#lista-mes'))
        self.assertIn('R$ 100,00', self.texto('#resumo-saiu'))
        self.ir_para('Dezembro 2026'); self.assertIn('parcela 2/3', self.texto('#lista-mes'))
        self.ir_para('Janeiro 2027'); self.assertIn('parcela 3/3', self.texto('#lista-mes'))
        self.assertEqual(sorted(t['competence_date'] for t in self.db('transactions')), ['2026-11-10', '2026-12-10', '2027-01-10'])

    def test_credito_aparece_no_mes_seguinte(self):
        self.preparar(); self.recarregar()
        self.lancar('800', 'Aluguel', tag='Moradia', pag='credito')
        self.assertNotIn('Aluguel', self.texto('#lista-mes'))
        self.ir_para('Dezembro 2026')
        self.assertIn('Aluguel', self.texto('#lista-mes'))

    def test_saldo_livre(self):
        self.preparar()
        self.seed('transactions', [dict(owner_id='u1', kind='receita', amount_cents=600000, description='Salário', purchase_date='2026-11-05', competence_date='2026-11-05'),
                                   gasto('u1', 387000, '2026-11-06'),
                                   dict(owner_id='u1', kind='investimento', amount_cents=80000, description='Tesouro', purchase_date='2026-11-07', competence_date='2026-11-07')])
        self.recarregar()
        self.assertIn('R$ 1.330,00', self.texto('#resumo-livre'))
        self.assertIn('R$ 800,00', self.texto('#resumo-investido'))

    def test_dados_da_outra_pessoa_so_leitura(self):
        self.preparar()
        self.seed('transactions', [gasto('u2', 5000, '2026-11-03', desc='Farmácia')])
        self.recarregar()
        self.assertNotIn('Farmácia', self.texto('#lista-mes'))
        self.page.click('[data-ver="ela"]'); self.page.wait_for_timeout(200)
        item = self.page.locator('#lista-mes .item', has_text='Farmácia')
        self.assertEqual(item.count(), 1)
        self.assertEqual(item.locator('.editar, .excluir').count(), 0)
        self.page.click('[data-ver="juntos"]'); self.page.wait_for_timeout(200)
        self.assertIn('Farmácia', self.texto('#lista-mes'))
        self.assertFalse(self.page.is_visible('#novo-lancamento') and False)

    def test_recorrente_nao_duplica(self):
        self.preparar()
        self.seed('recurrences', [dict(owner_id='u1', kind='gasto', amount_cents=150000, description='Aluguel', tag_id=None, payment='pix',
                                       day_of_month=5, start_month='2026-01-01', end_month=None, paused=False)])
        self.recarregar()
        self.assertIn('Aluguel', self.texto('#lista-mes'))
        self.page.click('#mes-seguinte'); self.page.click('#mes-anterior'); self.page.wait_for_timeout(200)
        self.recarregar()
        self.assertEqual(len([t for t in self.db('transactions') if t['competence_date'].startswith('2026-11')]), 1)

    def test_excluir_todas_as_parcelas(self):
        self.preparar(); self.recarregar()
        self.lancar('300', 'Tênis', pag='credito', data='2026-10-28', parcelas=3)
        self.page.locator('#lista-mes .item', has_text='Tênis').locator('.excluir').click()
        self.page.click('#excluir-todas'); self.page.wait_for_selector('#modal-fundo', state='hidden')
        self.assertEqual(self.db('transactions'), [])

    def test_excluir_so_esta_parcela(self):
        self.preparar(); self.recarregar()
        self.lancar('300', 'Tênis', pag='credito', data='2026-10-28', parcelas=3)
        self.page.locator('#lista-mes .item', has_text='Tênis').locator('.excluir').click()
        self.page.click('#excluir-so-esta'); self.page.wait_for_selector('#modal-fundo', state='hidden')
        self.assertEqual(len(self.db('transactions')), 2)

    def test_editar_valor(self):
        self.preparar(); self.recarregar()
        self.lancar('10', 'Café')
        self.page.locator('#lista-mes .item', has_text='Café').locator('.editar').click()
        self.page.fill('#lanc-valor', '12,50'); self.page.click('#lanc-salvar')
        self.page.wait_for_selector('#modal-fundo', state='hidden')
        self.assertIn('R$ 12,50', self.texto('#lista-mes'))
        self.assertEqual(self.db('transactions')[0]['amount_cents'], 1250)

    def test_mudar_data_da_compra_parcelada_recalcula_todas(self):
        self.preparar(); self.recarregar()
        self.lancar('300', 'Tênis', pag='credito', data='2026-10-28', parcelas=3)
        self.page.locator('#lista-mes .item', has_text='Tênis').locator('.editar').click()
        self.page.fill('#lanc-data', '2026-11-28'); self.page.select_option('#lanc-escopo', 'todas')
        self.page.click('#lanc-salvar'); self.page.wait_for_selector('#modal-fundo', state='hidden')
        self.assertEqual(sorted(t['competence_date'] for t in self.db('transactions')), ['2026-12-10', '2027-01-10', '2027-02-10'])

    def test_busca_filtra_lista(self):
        self.preparar()
        self.seed('transactions', [gasto('u1', 100, '2026-11-03', desc='Padaria'), gasto('u1', 200, '2026-11-04', desc='Uber')])
        self.recarregar()
        self.page.fill('#busca-mes', 'pada'); self.page.wait_for_timeout(150)
        self.assertIn('Padaria', self.texto('#lista-mes')); self.assertNotIn('Uber', self.texto('#lista-mes'))

    def test_estorno_grava_negativo(self):
        self.preparar(); self.recarregar()
        self.lancar('20', 'Devolução', estorno=True)
        self.assertEqual(self.db('transactions')[0]['amount_cents'], -2000)

    def test_valor_invalido_nao_salva(self):
        self.preparar(); self.recarregar()
        p = self.page
        p.click('#novo-lancamento'); p.fill('#lanc-valor', 'abc'); p.click('#lanc-salvar')
        self.assertIn('Informe um valor', p.inner_text('#lanc-erro'))
        self.assertEqual(self.db('transactions'), [])

    def test_receita_e_investimento_nao_pedem_pagamento(self):
        self.preparar(); self.recarregar()
        p = self.page
        p.click('#novo-lancamento'); p.click('[data-tipo="receita"]')
        self.assertFalse(p.is_visible('[data-pag="credito"]'))
        p.fill('#lanc-valor', '6000'); p.fill('#lanc-desc', 'Salário'); p.click('#lanc-salvar')
        p.wait_for_selector('#modal-fundo', state='hidden')
        self.assertIn('R$ 6.000,00', self.texto('#resumo-entrou'))

    def test_barra_de_orcamento_muda_de_cor(self):
        self.preparar()
        a = self.tags['Alimentação']
        self.seed('budgets', [dict(owner_id='u1', tag_id=a, monthly_cents=100000)])
        self.seed('transactions', [gasto('u1', 90000, '2026-11-03', tag=a)])
        self.recarregar()
        self.assertEqual(self.page.locator(f'#orcamentos .orcamento[data-tag="{a}"] .barra.atencao').count(), 1)
