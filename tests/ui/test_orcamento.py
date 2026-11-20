from harness import UITest

def tx(owner, kind, valor, comp, tag=None, pag='pix', desc=None, extra=False):
    d = dict(owner_id=owner, kind=kind, amount_cents=valor, description=desc or kind, purchase_date=comp,
             competence_date=comp, tag_id=tag, payment=pag if kind in ('gasto', 'doacao') else None)
    if extra: d['extraordinario'] = True
    return d

class Mascara(UITest):
    def test_digitar_coloca_a_virgula_sozinho(self):
        self.login(); p = self.page
        p.click('#novo-lancamento'); p.click('#lanc-valor')
        p.keyboard.type('4890')
        self.assertEqual(p.input_value('#lanc-valor'), '48,90')
        p.keyboard.type('0')
        self.assertEqual(p.input_value('#lanc-valor'), '489,00')
        p.keyboard.press('Backspace')
        self.assertEqual(p.input_value('#lanc-valor'), '48,90')
        p.click('#lanc-salvar'); p.wait_for_selector('#modal-fundo', state='hidden')
        self.assertEqual(self.db('transactions')[0]['amount_cents'], 4890)

    def test_colar_um_valor_mantem_o_que_esta_escrito(self):
        self.login(); p = self.page
        p.click('#novo-lancamento'); p.fill('#lanc-valor', '1.500')
        self.assertEqual(p.input_value('#lanc-valor'), '1.500,00')

    def test_outros_campos_de_dinheiro_tambem(self):
        self.login(); p = self.page
        self.go('metas'); p.click('#meta-nova'); p.click('#meta-alvo'); p.keyboard.type('1000000')
        self.assertEqual(p.input_value('#meta-alvo'), '10.000,00')
        p.keyboard.press('Escape')
        self.go('recorrentes'); p.click('#rec-novo'); p.click('#rec-valor'); p.keyboard.type('15000')
        self.assertEqual(p.input_value('#rec-valor'), '150,00')

class Extraordinario(UITest):
    def preparar(self):
        self.login()
        self.seed('tags', [dict(name='Estética', color='#D81B60', icon='scissors', parent_id=None, archived=False, created_by='u1')])
        self.est = self.db('tags')[0]['id']
        self.seed('budgets', [dict(owner_id='u1', tag_id=self.est, monthly_cents=10000)])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()

    def test_opcao_sempre_visivel_no_novo_lancamento(self):
        self.preparar(); p = self.page
        p.click('#novo-lancamento')
        self.assertTrue(p.is_visible('#lanc-extra'))
        self.assertIn('extraordinário', p.inner_text('#campo-extra').lower())

    def test_extraordinario_fica_fora_da_barra_mas_conta_no_que_saiu(self):
        self.preparar(); p = self.page
        p.click('#novo-lancamento'); p.fill('#lanc-valor', '15.000'); p.fill('#lanc-desc', 'Implante capilar')
        p.select_option('#lanc-tag', label='Estética'); p.check('#lanc-extra')
        p.click('#lanc-salvar'); p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        self.assertTrue(self.db('transactions')[0]['extraordinario'])
        linha = p.locator(f'#orcamentos .orcamento[data-tag="{self.est}"]')
        txt = linha.inner_text().replace('\xa0', ' ')
        self.assertIn('R$ 0,00 de R$ 100,00', txt)
        self.assertIn('+ R$ 15.000,00 extraordinário', txt)
        self.assertEqual(linha.locator('.barra.estourou').count(), 0)
        self.assertIn('R$ 15.000,00', p.inner_text('#resumo-saiu').replace('\xa0', ' '))
        self.assertIn('Extraordinário', p.locator('#lista-mes .item', has_text='Implante').inner_text())

    def test_parcelado_extraordinario_marca_todas(self):
        self.preparar(); p = self.page
        p.click('#novo-lancamento'); p.fill('#lanc-valor', '15.000'); p.click('[data-pag="credito"]')
        p.select_option('#lanc-parcelas', '10'); p.check('#lanc-extra')
        p.click('#lanc-salvar'); p.wait_for_selector('#modal-fundo', state='hidden')
        self.assertEqual([t['extraordinario'] for t in self.db('transactions')], [True] * 10)

    def test_editar_desmarca(self):
        self.preparar()
        self.seed('transactions', [tx('u1', 'gasto', 5000, '2026-11-03', self.est, desc='Corte', extra=True)])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()
        self.page.locator('#lista-mes .item', has_text='Corte').locator('.editar').click()
        self.assertTrue(self.page.is_checked('#lanc-extra'))
        self.page.uncheck('#lanc-extra'); self.page.click('#lanc-salvar'); self.page.wait_for_selector('#modal-fundo', state='hidden')
        self.assertFalse(self.db('transactions')[0]['extraordinario'])

class AbaOrcamento(UITest):
    def preparar(self, receita=600000):
        self.login()
        self.seed('tags', [dict(name='Moradia', color='#6F4E37', icon='home', parent_id=None, archived=False, created_by='u1'),
                           dict(name='Lazer', color='#C68B59', icon='movie', parent_id=None, archived=False, created_by='u1'),
                           dict(name='Renda extra', color='#5B7A3A', icon='cash', parent_id=None, archived=False, created_by='u1')])
        self.t = {x['name']: x['id'] for x in self.db('tags')}
        self.seed('budgets', [dict(owner_id='u1', tag_id=self.t['Moradia'], monthly_cents=150000),
                              dict(owner_id='u1', tag_id=self.t['Lazer'], monthly_cents=30000),
                              dict(owner_id='u1', tag_id=self.t['Renda extra'], monthly_cents=50000)])
        txs = [tx('u1', 'gasto', 150000, '2026-11-05', self.t['Moradia']), tx('u1', 'gasto', 5000, '2026-11-06', self.t['Lazer']),
               tx('u1', 'gasto', 1500000, '2026-11-07', self.t['Lazer'], extra=True),
               tx('u1', 'receita', 20000, '2026-10-03', self.t['Renda extra'])]
        if receita: txs.append(tx('u1', 'receita', receita, '2026-11-05', self.t['Renda extra']))
        self.seed('transactions', txs)
        self.go('orcamento')

    def texto(self, sel):
        return self.page.inner_text(sel).replace('\xa0', ' ')

    def test_menu_tem_orcamento(self):
        self.login(); self.page.click('#menu-botao')
        self.assertTrue(self.page.is_visible('[data-tela="orcamento"]'))

    def test_encaixe_usa_o_que_entrou_no_mes(self):
        self.preparar()
        self.assertIn('Novembro 2026', self.texto('#tela-orcamento'))
        self.assertIn('R$ 6.000,00', self.texto('#orc-renda'))
        self.assertIn('R$ 1.800,00', self.texto('#orc-planejado'))
        self.assertIn('30%', self.texto('#orc-planejado'))
        self.assertIn('Sobra planejada R$ 4.200,00', self.texto('#orc-encaixe'))
        self.assertEqual(self.page.locator('#orc-encaixe.encaixa').count(), 1)

    def test_avisa_quando_os_limites_nao_cabem(self):
        self.preparar(receita=100000)
        self.assertIn('passam R$ 800,00', self.texto('#orc-encaixe'))
        self.assertEqual(self.page.locator('#orc-encaixe.nao-encaixa').count(), 1)

    def test_sem_receita_no_mes_explica(self):
        self.preparar(receita=0)
        self.assertIn('Ainda não entrou nada', self.texto('#orc-encaixe'))

    def test_tabela_por_tag_com_gasto_e_extraordinario_separado(self):
        self.preparar()
        lazer = self.texto(f'#orc-tags .orc-linha[data-tag="{self.t["Lazer"]}"]')
        self.assertIn('R$ 50,00', lazer); self.assertIn('5%', lazer)
        self.assertIn('+ R$ 15.000,00 extraordinário', lazer)
        self.assertIn('Extraordinários do mês: R$ 15.000,00', self.texto('#tela-orcamento'))

    def test_tag_de_receita_fica_em_metas_de_receita(self):
        self.preparar()
        self.assertEqual(self.page.locator(f'#orc-tags .orc-linha[data-tag="{self.t["Renda extra"]}"]').count(), 0)
        self.assertIn('Entrou R$ 6.000,00 de R$ 500,00', self.texto(f'#orc-receitas .orc-linha[data-tag="{self.t["Renda extra"]}"]'))

    def test_editar_limite_na_propria_aba(self):
        self.preparar(); p = self.page
        campo = f'#orc-tags .orc-linha[data-tag="{self.t["Lazer"]}"] .orc-limite'
        p.fill(campo, '450'); p.press(campo, 'Enter'); self.pronto()
        b = next(x for x in self.db('budgets') if x['tag_id'] == self.t['Lazer'])
        self.assertEqual(b['monthly_cents'], 45000)
        self.assertIn('R$ 1.950,00', self.texto('#orc-planejado'))
        p.fill(campo, ''); p.press(campo, 'Enter'); self.pronto()
        self.assertFalse(any(x['tag_id'] == self.t['Lazer'] for x in self.db('budgets')))

    def test_criar_limite_para_tag_sem_limite(self):
        self.login()
        self.seed('tags', [dict(name='Saúde', color='#B5543A', icon='pill', parent_id=None, archived=False, created_by='u1')])
        self.go('orcamento'); p = self.page
        campo = '#orc-tags .orc-linha .orc-limite'
        self.assertEqual(p.input_value(campo), '')
        p.fill(campo, '300'); p.press(campo, 'Enter'); self.pronto()
        self.assertEqual(self.db('budgets')[0]['monthly_cents'], 30000)

    def test_formulario_de_tag_nao_tem_mais_limite(self):
        self.login(); self.go('tags'); self.page.click('#tag-nova')
        self.assertEqual(self.page.locator('#tag-orcamento').count(), 0)

    def test_cartao_do_mes_continua_com_atalho(self):
        self.preparar(); self.go('mes')
        self.assertTrue(self.page.is_visible('#orcamentos'))
        self.page.click('#ir-orcamento'); self.page.wait_for_selector('#tela-orcamento', state='visible')

    def test_cabe_no_celular(self):
        self.preparar()
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 390)

class InvestimentoNoOrcamento(UITest):
    def test_investimento_conta_na_barra_da_tag(self):
        self.login()
        self.seed('tags', [dict(name='Investimento', color='#154360', icon='pig-money', parent_id=None, archived=False, created_by='u1')])
        inv = self.db('tags')[0]['id']
        self.seed('tags', [dict(name='Renda variável', color='#2471A3', icon='chart-line', parent_id=inv, archived=False, created_by='u1')])
        rv = next(t['id'] for t in self.db('tags') if t['name'] == 'Renda variável')
        self.seed('budgets', [dict(owner_id='u1', tag_id=inv, monthly_cents=100000)])
        self.seed('transactions', [tx('u1', 'investimento', 60000, '2026-11-11', rv, desc='Bolsa de valores'),
                                   tx('u1', 'receita', 500000, '2026-11-05')])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()
        self.assertIn('R$ 600,00 de R$ 1.000,00', self.page.inner_text(f'#orcamentos .orcamento[data-tag="{inv}"]').replace('\xa0', ' '))
        self.go('orcamento')
        linha = self.page.inner_text(f'#orc-tags .orc-linha[data-tag="{inv}"]').replace('\xa0', ' ')
        self.assertIn('saiu R$ 600,00 de R$ 1.000,00', linha)

    def test_totais_do_topo_continuam_separados(self):
        self.test_investimento_conta_na_barra_da_tag()
        self.go('mes')
        self.assertIn('R$ 0,00', self.page.inner_text('#resumo-saiu').replace('\xa0', ' '))
        self.assertIn('R$ 600,00', self.page.inner_text('#resumo-investido').replace('\xa0', ' '))
        self.go('orcamento')
        self.assertIn('R$ 0,00', self.page.inner_text('#orc-gasto').replace('\xa0', ' '))

class InvestimentoVerde(UITest):
    def preparar(self, valor):
        self.login()
        self.seed('tags', [dict(name='Investimento', color='#154360', icon='pig-money', parent_id=None, archived=False, created_by='u1'),
                           dict(name='Lazer', color='#C68B59', icon='movie', parent_id=None, archived=False, created_by='u1')])
        self.t = {x['name']: x['id'] for x in self.db('tags')}
        self.seed('budgets', [dict(owner_id='u1', tag_id=self.t['Investimento'], monthly_cents=100000),
                              dict(owner_id='u1', tag_id=self.t['Lazer'], monthly_cents=10000)])
        self.seed('transactions', [tx('u1', 'investimento', valor, '2026-11-02', self.t['Investimento']),
                                   tx('u1', 'gasto', 20000, '2026-11-02', self.t['Lazer']),
                                   tx('u1', 'receita', 500000, '2026-11-01')])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()

    def test_investimento_acima_do_limite_fica_verde_no_mes_e_na_aba(self):
        self.preparar(120000)
        inv = self.t['Investimento']
        linha = self.page.locator(f'#orcamentos .orcamento[data-tag="{inv}"]')
        self.assertEqual(linha.locator('.barra.superou').count(), 1)
        self.assertEqual(linha.locator('.negativo').count(), 0)
        self.assertEqual(linha.locator('.positivo').count(), 1)
        lazer = self.page.locator(f'#orcamentos .orcamento[data-tag="{self.t["Lazer"]}"]')
        self.assertEqual(lazer.locator('.barra.estourou').count(), 1)
        self.go('orcamento')
        row = self.page.locator(f'#orc-tags .orc-linha[data-tag="{inv}"]')
        self.assertEqual(row.locator('.barra.superou').count(), 1)

    def test_investimento_perto_do_limite_nao_fica_laranja(self):
        self.preparar(90000)
        inv = self.t['Investimento']
        self.assertEqual(self.page.locator(f'#orcamentos .orcamento[data-tag="{inv}"] .barra.atencao').count(), 0)

class ExtraParcial(UITest):
    def preparar(self):
        self.login()
        self.seed('tags', [dict(name='Estética', color='#D81B60', icon='scissors', parent_id=None, archived=False, created_by='u1')])
        self.est = self.db('tags')[0]['id']
        self.seed('budgets', [dict(owner_id='u1', tag_id=self.est, monthly_cents=100000)])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()

    def abrir(self, valor='15.500'):
        p = self.page
        p.click('#novo-lancamento'); p.fill('#lanc-valor', valor); p.fill('#lanc-desc', 'Implante + consulta')
        p.select_option('#lanc-tag', label='Estética')

    def salvar(self):
        self.page.click('#lanc-salvar'); self.page.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()

    def test_campo_aparece_ao_marcar_e_vem_com_o_total(self):
        self.preparar(); self.abrir(); p = self.page
        self.assertFalse(p.is_visible('#lanc-extra-valor'))
        p.check('#lanc-extra')
        self.assertTrue(p.is_visible('#lanc-extra-valor'))
        self.assertEqual(p.input_value('#lanc-extra-valor'), '15.500,00')

    def test_so_parte_fica_fora_do_orcamento(self):
        self.preparar(); self.abrir(); p = self.page
        p.check('#lanc-extra'); p.fill('#lanc-extra-valor', '15.000'); self.salvar()
        t = self.db('transactions')[0]
        self.assertEqual((t['extraordinario'], t['extraordinario_cents']), (True, 1500000))
        linha = p.inner_text(f'#orcamentos .orcamento[data-tag="{self.est}"]').replace('\xa0', ' ')
        self.assertIn('R$ 500,00 de R$ 1.000,00', linha)
        self.assertIn('+ R$ 15.000,00 extraordinário', linha)
        self.assertIn('Extraordinário: R$ 15.000,00', p.locator('#lista-mes .item', has_text='Implante').inner_text().replace('\xa0', ' '))

    def test_tudo_extraordinario_nao_grava_valor_parcial(self):
        self.preparar(); self.abrir(); self.page.check('#lanc-extra'); self.salvar()
        t = self.db('transactions')[0]
        self.assertTrue(t['extraordinario']); self.assertIsNone(t.get('extraordinario_cents'))

    def test_parte_maior_que_o_total_nao_salva(self):
        self.preparar(); self.abrir(valor='100'); p = self.page
        p.check('#lanc-extra'); p.fill('#lanc-extra-valor', '200'); p.click('#lanc-salvar')
        self.assertIn('não pode ser maior que o valor', p.inner_text('#lanc-erro'))
        self.assertEqual(self.db('transactions'), [])

    def test_parcelado_divide_a_parte_extraordinaria(self):
        self.preparar(); self.abrir(valor='300'); p = self.page
        p.click('[data-pag="credito"]'); p.select_option('#lanc-parcelas', '3')
        p.check('#lanc-extra'); p.fill('#lanc-extra-valor', '150'); self.salvar()
        ts = sorted(self.db('transactions'), key=lambda t: t['installment_n'])
        self.assertEqual([t['extraordinario_cents'] for t in ts], [5000, 5000, 5000])

    def test_editar_mostra_e_muda_a_parte(self):
        self.preparar()
        self.seed('transactions', [dict(owner_id='u1', kind='gasto', amount_cents=1550000, description='Implante', purchase_date='2026-11-02',
                                        competence_date='2026-11-02', tag_id=self.est, payment='pix', extraordinario=True, extraordinario_cents=1500000)])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()
        self.page.locator('#lista-mes .item', has_text='Implante').locator('.editar').click()
        self.assertEqual(self.page.input_value('#lanc-extra-valor'), '15.000,00')
        self.page.fill('#lanc-extra-valor', '14.000'); self.salvar()
        self.assertEqual(self.db('transactions')[0]['extraordinario_cents'], 1400000)
