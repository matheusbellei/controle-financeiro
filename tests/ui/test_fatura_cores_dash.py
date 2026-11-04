from harness import UITest

def tx(owner, kind, valor, comp, tag=None, pag='pix'):
    return dict(owner_id=owner, kind=kind, amount_cents=valor, description=kind, purchase_date=comp,
                competence_date=comp, tag_id=tag, payment=pag if kind in ('gasto', 'doacao') else None)

class Fatura(UITest):
    def abrir_credito(self, valor='300', data='2026-10-28'):
        p = self.page
        p.click('#novo-lancamento'); p.fill('#lanc-valor', valor); p.fill('#lanc-data', data); p.click('[data-pag="credito"]')

    def salvar(self):
        self.page.click('#lanc-salvar'); self.page.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()

    def test_campo_fatura_vem_com_dia_10_e_segue_a_data_da_compra(self):
        self.login(); self.abrir_credito()
        self.assertTrue(self.page.is_visible('#lanc-fatura'))
        self.assertEqual(self.page.input_value('#lanc-fatura'), '2026-11-10')
        self.page.fill('#lanc-data', '2026-12-05'); self.page.dispatch_event('#lanc-data', 'input')
        self.assertEqual(self.page.input_value('#lanc-fatura'), '2027-01-10')

    def test_campo_fatura_some_fora_do_credito(self):
        self.login()
        self.page.click('#novo-lancamento'); self.page.click('[data-pag="pix"]')
        self.assertFalse(self.page.is_visible('#lanc-fatura'))

    def test_escolher_data_da_fatura(self):
        self.login(); self.abrir_credito(valor='80')
        self.page.fill('#lanc-fatura', '2026-11-25'); self.page.dispatch_event('#lanc-fatura', 'input')
        self.assertIn('25/11', self.page.inner_text('#lanc-aviso'))
        self.salvar()
        t = self.db('transactions')[0]
        self.assertEqual((t['purchase_date'], t['competence_date']), ('2026-10-28', '2026-11-25'))

    def test_fatura_escolhida_vale_mesmo_mudando_a_compra_depois(self):
        self.login(); self.abrir_credito(valor='80')
        self.page.fill('#lanc-fatura', '2026-11-25'); self.page.dispatch_event('#lanc-fatura', 'input')
        self.page.fill('#lanc-data', '2026-10-29'); self.page.dispatch_event('#lanc-data', 'input')
        self.assertEqual(self.page.input_value('#lanc-fatura'), '2026-11-25')

    def test_parcelado_a_partir_da_fatura_escolhida(self):
        self.login(); self.abrir_credito()
        self.page.select_option('#lanc-parcelas', '3')
        self.page.fill('#lanc-fatura', '2026-11-25'); self.page.dispatch_event('#lanc-fatura', 'input')
        self.salvar()
        self.assertEqual(sorted(t['competence_date'] for t in self.db('transactions')), ['2026-11-25', '2026-12-25', '2027-01-25'])

    def test_fatura_antes_da_compra_e_recusada(self):
        self.login(); self.abrir_credito()
        self.page.fill('#lanc-fatura', '2026-10-01'); self.page.click('#lanc-salvar')
        self.assertIn('não pode ser antes da compra', self.page.inner_text('#lanc-erro'))
        self.assertEqual(self.db('transactions'), [])

    def test_editar_muda_a_data_da_fatura(self):
        self.login()
        self.seed('transactions', [dict(owner_id='u1', kind='gasto', amount_cents=5000, description='Livro', purchase_date='2026-11-01',
                                        competence_date='2026-11-10', tag_id=None, payment='credito')])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()
        self.page.locator('#lista-mes .item', has_text='Livro').locator('.editar').click()
        self.assertEqual(self.page.input_value('#lanc-fatura'), '2026-11-10')
        self.page.fill('#lanc-fatura', '2026-11-20'); self.salvar()
        self.assertEqual(self.db('transactions')[0]['competence_date'], '2026-11-20')

    def test_editar_todas_as_parcelas_move_a_partir_da_fatura(self):
        self.login(); self.abrir_credito(); self.page.select_option('#lanc-parcelas', '3'); self.salvar()
        self.page.locator('#lista-mes .item', has_text='parcela 1/3').locator('.editar').click()
        self.page.select_option('#lanc-escopo', 'todas')
        self.page.fill('#lanc-fatura', '2026-11-15'); self.salvar()
        self.assertEqual(sorted(t['competence_date'] for t in self.db('transactions')), ['2026-11-15', '2026-12-15', '2027-01-15'])

class CoresIcones(UITest):
    def test_muito_mais_cores_e_icones(self):
        self.login(); self.go('tags'); self.page.click('#tag-nova')
        self.assertGreaterEqual(self.page.locator('#modal .paleta [data-cor]').count(), 40)
        self.assertGreaterEqual(self.page.locator('#modal .icones [data-icone]').count(), 150)
        self.assertGreaterEqual(self.page.locator('#modal .grupo-icones').count(), 8)

    def test_cor_personalizada(self):
        self.login(); self.go('tags'); p = self.page
        p.click('#tag-nova'); p.fill('#tag-nome', 'Teste')
        p.fill('#cor-livre', '#12ab34'); p.dispatch_event('#cor-livre', 'input')
        p.click('#tag-salvar'); p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        self.assertEqual(self.db('tags')[0]['color'], '#12ab34')

    def test_subtag_tem_as_mesmas_opcoes(self):
        self.login(); self.go('tags'); p = self.page
        p.click('#tag-nova'); p.fill('#tag-nome', 'Casa'); p.click('#tag-salvar'); p.wait_for_selector('#modal-fundo', state='hidden')
        self.go('subtags'); p.click('#subtag-nova')
        self.assertGreaterEqual(p.locator('#modal .icones [data-icone]').count(), 150)
        self.assertEqual(p.locator('#modal #cor-livre').count(), 1)

class DashFiltros(UITest):
    def opcoes(self, canvas):
        return self.page.evaluate("""(id) => { const c = window.__charts.find((x) => x.__canvas === id);
            return JSON.parse(JSON.stringify({type: c.type, labels: c.data.labels, data: c.data.datasets.map((d) => d.data), series: c.data.datasets.map((d) => d.label)})); }""", canvas)

    def preparar(self):
        self.login()
        self.seed('tags', [dict(name='Moradia', color='#6F4E37', icon='home', parent_id=None, archived=False, created_by='u1')])
        m = self.db('tags')[0]['id']
        self.seed('transactions', [tx('u1', 'gasto', 150000, '2026-11-05', m), tx('u1', 'gasto', 30000, '2026-03-05', m),
                                   tx('u1', 'gasto', 90000, '2025-11-05', m), tx('u1', 'gasto', 40000, '2024-11-05', m),
                                   tx('u1', 'receita', 600000, '2026-11-05'), tx('u1', 'receita', 500000, '2025-11-05'),
                                   tx('u1', 'investimento', 50000, '2026-02-05'), tx('u1', 'investimento', 70000, '2026-05-05')])
        self.go('dashboards')

    def mudar(self, sel, valor):
        self.page.select_option(sel, valor); self.pronto()

    def test_sem_filtro_geral_de_periodo_no_topo(self):
        self.preparar()
        self.assertEqual(self.page.locator('#dash-periodo, #dash-mes, #dash-ano').count(), 0)

    def test_gasto_por_tag_tem_periodo_proprio(self):
        self.preparar()
        self.assertEqual(self.opcoes('graf-tag')['data'][0], [1500])
        self.mudar('#f-tag-mes', '3')
        self.assertEqual(self.opcoes('graf-tag')['data'][0], [300])
        self.mudar('#f-tag-periodo', 'ano')
        self.assertFalse(self.page.is_visible('#f-tag-mes'))
        self.assertEqual(self.opcoes('graf-tag')['data'][0], [1800])
        self.mudar('#f-tag-ano', '2025')
        self.assertEqual(self.opcoes('graf-tag')['data'][0], [900])

    def test_gasto_por_tag_em_rosca(self):
        self.preparar(); self.mudar('#f-tag-formato', 'rosca')
        self.assertEqual(self.opcoes('graf-tag')['type'], 'doughnut')

    def test_mes_a_mes_escolhe_ano_series_e_formato(self):
        self.preparar()
        self.mudar('#f-evo-ano', '2025')
        o = self.opcoes('graf-evolucao'); self.assertEqual(o['data'][1][10], 900)
        self.page.click('#tela-dashboards [data-serie="receitas"]'); self.pronto()
        self.assertNotIn('Entrou', self.opcoes('graf-evolucao')['series'])
        self.mudar('#f-evo-formato', 'linhas')
        self.assertEqual(self.opcoes('graf-evolucao')['type'], 'line')

    def test_comparativo_medida_modo_mes_e_anos(self):
        self.preparar()
        o = self.opcoes('graf-comparativo')
        self.assertEqual(o['labels'], ['2024', '2025', '2026'])
        self.assertEqual(o['data'][0], [400, 900, 1500])
        self.mudar('#f-comp-modo', 'ano')
        self.assertFalse(self.page.is_visible('#f-comp-mes'))
        self.assertEqual(self.opcoes('graf-comparativo')['data'][0], [400, 900, 1800])
        self.mudar('#f-comp-medida', 'receitas')
        self.assertEqual(self.opcoes('graf-comparativo')['data'][0], [0, 5000, 6000])
        self.page.click('#tela-dashboards [data-comp-ano="2024"]'); self.pronto()
        self.assertEqual(self.opcoes('graf-comparativo')['labels'], ['2025', '2026'])
        self.mudar('#f-comp-modo', 'mes'); self.mudar('#f-comp-mes', '3'); self.mudar('#f-comp-medida', 'gastos')
        self.assertEqual(self.opcoes('graf-comparativo')['data'][0], [0, 300])
        self.assertIn('Março', self.page.inner_text('#titulo-comparativo'))

    def test_aportes_por_ano_e_acumulado(self):
        self.preparar()
        self.assertEqual(self.opcoes('graf-aportes')['data'][0][4], 700)
        self.mudar('#f-ap-modo', 'acumulado')
        d = self.opcoes('graf-aportes')['data'][0]
        self.assertEqual((d[1], d[4], d[11]), (500, 1200, 1200))
        self.mudar('#f-ap-ano', '2025')
        self.assertIn('R$ 0,00', self.page.inner_text('#aportes-total').replace('\xa0', ' '))

    def test_filtros_do_dashboard_nao_mudam_a_tela_mes(self):
        self.preparar(); self.mudar('#f-tag-mes', '3'); self.mudar('#f-evo-ano', '2025')
        self.go('mes')
        self.assertIn('Novembro 2026', self.page.inner_text('#mes-titulo'))
