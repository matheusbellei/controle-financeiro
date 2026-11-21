from harness import UITest

def tx(owner, kind, valor, comp, tag=None, pag='pix'):
    return dict(owner_id=owner, kind=kind, amount_cents=valor, description=kind, purchase_date=comp,
                competence_date=comp, tag_id=tag, payment=pag if kind in ('gasto', 'doacao') else None)

class Doacoes(UITest):
    def test_lancar_doacao(self):
        self.login()
        p = self.page
        p.click('#novo-lancamento'); p.click('[data-tipo="doacao"]')
        self.assertTrue(p.is_visible('[data-pag="pix"]'))
        self.assertFalse(p.is_visible('#lanc-estorno'))
        p.fill('#lanc-valor', '50'); p.fill('#lanc-desc', 'Igreja'); p.click('#lanc-salvar')
        p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        self.assertEqual(self.db('transactions')[0]['kind'], 'doacao')
        self.assertIn('R$ 50,00', p.inner_text('#resumo-doacoes').replace('\xa0', ' '))
        self.assertIn('R$ 50,00', p.inner_text('#resumo-saiu').replace('\xa0', ' '))  # Saiu soma a doação
        self.assertIn('só gastos R$ 0,00', p.inner_text('#resumo-so-gastos').replace('\xa0', ' '))
        self.assertIn('-R$ 50,00', p.inner_text('#resumo-livre').replace('\xa0', ' '))
        self.assertIn('Igreja', p.inner_text('#lista-mes'))

    def test_doacao_no_credito_vai_para_o_dia_10(self):
        self.login()
        p = self.page
        p.click('#novo-lancamento'); p.click('[data-tipo="doacao"]'); p.click('[data-pag="credito"]')
        p.fill('#lanc-valor', '100'); p.click('#lanc-salvar'); p.wait_for_selector('#modal-fundo', state='hidden')
        self.assertEqual(self.db('transactions')[0]['competence_date'], '2026-12-10')

    def test_doacao_recorrente(self):
        self.login(); self.go('recorrentes')
        p = self.page
        p.click('#rec-novo'); p.click('#modal [data-tipo="doacao"]')
        self.assertTrue(p.is_visible('#modal [data-pag="pix"]'))
        p.fill('#rec-valor', '100'); p.fill('#rec-desc', 'Dízimo'); p.fill('#rec-dia', '10'); p.click('#rec-salvar')
        p.wait_for_selector('#modal-fundo', state='hidden')
        self.assertEqual(self.db('recurrences')[0]['kind'], 'doacao')

    def test_doacao_nos_graficos_e_no_ano(self):
        self.login()
        self.seed('transactions', [tx('u1', 'doacao', 30000, '2026-11-03')])
        self.go('ano')
        self.assertIn('Saiu R$ 300,00', self.page.inner_text('#grade-ano .mes-ano[data-mes="11"]').replace('\xa0', ' '))
        self.go('dashboards')
        c = self.page.evaluate("""() => window.__charts.find((x) => x.__canvas === 'graf-evolucao').data.datasets.map((d) => [d.label, d.data[10]])""")
        self.assertIn(['Doado', 300], c)

class Subtags(UITest):
    def criar_tag(self, nome):
        p = self.page
        p.click('#tag-nova'); p.fill('#tag-nome', nome); p.click('#tag-salvar')
        p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()

    def test_form_de_tag_nao_fala_de_subtag(self):
        self.login(); self.go('tags')
        self.page.click('#tag-nova')
        self.assertEqual(self.page.locator('#tag-mae').count(), 0)
        self.assertNotIn('subtag', self.page.inner_text('#modal').lower())

    def test_sem_aba_de_subtags_no_menu(self):
        self.login(); self.page.click('#menu-botao')
        self.assertEqual(self.page.locator('[data-tela="subtags"]').count(), 0)
        self.assertEqual(self.page.locator('#tela-subtags').count(), 0)

    def test_criar_subtag_dentro_do_bloco_da_tag(self):
        self.login(); self.go('tags'); self.criar_tag('Alimentação')
        p = self.page
        self.nova_subtag('Alimentação')
        self.assertEqual(p.input_value('#subtag-tag'), next(t for t in self.db('tags') if t['name'] == 'Alimentação')['id'])
        p.fill('#subtag-nome', 'Mercado')
        p.click('.paleta [data-cor="#D4A373"]'); p.click('.icones [data-icone="shopping-cart"]')
        p.click('#subtag-salvar'); p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        sub = next(t for t in self.db('tags') if t['name'] == 'Mercado')
        mae = next(t for t in self.db('tags') if t['name'] == 'Alimentação')
        self.assertEqual((sub['parent_id'], sub['color'], sub['icon']), (mae['id'], '#D4A373', 'shopping-cart'))
        self.assertIn('Mercado', self.bloco('Alimentação').inner_text())
        self.assertNotIn('Mercado', ' '.join(p.locator('#lista-tags .bloco-topo .tag-nome').all_inner_texts()))
        self.assertTrue(self.page.is_visible('#tela-tags'))

    def test_subtag_exige_nome(self):
        self.login(); self.go('tags'); self.criar_tag('Lazer')
        self.nova_subtag('Lazer'); self.page.click('#subtag-salvar')
        self.assertIn('Dê um nome', self.page.inner_text('#subtag-erro'))

    def test_editar_trocar_de_tag_e_arquivar_subtag(self):
        self.login(); self.go('tags'); self.criar_tag('Casa'); self.criar_tag('Carro')
        p = self.page
        self.nova_subtag('Casa'); p.fill('#subtag-nome', 'Luz')
        p.click('#subtag-salvar'); p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        self.linha_sub('Luz').locator('.tag-editar').click()
        self.assertTrue(p.is_visible('#subtag-nome'))
        p.select_option('#subtag-tag', label='Carro'); p.click('#subtag-salvar')
        p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        carro = next(t for t in self.db('tags') if t['name'] == 'Carro')
        self.assertEqual(next(t for t in self.db('tags') if t['name'] == 'Luz')['parent_id'], carro['id'])
        self.assertIn('Luz', self.bloco('Carro').inner_text())
        self.linha_sub('Luz').locator('.tag-arquivar').click(); self.pronto()
        self.assertTrue(next(t for t in self.db('tags') if t['name'] == 'Luz')['archived'])

class Graficos(UITest):
    def opcoes(self, canvas):
        return self.page.evaluate("""(id) => { const c = window.__charts.find((x) => x.__canvas === id);
            const s = c.options.scales; return JSON.parse(JSON.stringify({x: s.x, y: s.y, labels: c.data.labels, data: c.data.datasets.map((d) => d.data)})); }""", canvas)

    def preparar(self):
        self.login()
        self.seed('tags', [dict(name='Moradia', color='#6F4E37', icon='home', parent_id=None, archived=False, created_by='u1'),
                           dict(name='Lazer', color='#C68B59', icon='movie', parent_id=None, archived=False, created_by='u1'),
                           dict(name='Velha', color='#C68B59', icon='tag', parent_id=None, archived=True, created_by='u1')])

    def test_tags_aparecem_mesmo_sem_gasto(self):
        self.preparar(); self.go('dashboards')
        o = self.opcoes('graf-tag')
        self.assertEqual(sorted(o['labels']), ['Lazer', 'Moradia'])
        self.assertEqual(o['data'][0], [0, 0])
        self.assertIn('Moradia', self.page.inner_text('#tela-dashboards'))

    def test_sem_nenhuma_tag_explica_o_que_fazer(self):
        self.login(); self.go('dashboards')
        self.assertIn('Crie tags', self.page.inner_text('#tela-dashboards'))

    def test_eixo_vazio_vai_de_300_em_300(self):
        self.preparar(); self.go('dashboards')
        y = self.opcoes('graf-evolucao')['y']
        self.assertEqual((y['min'], y['max'], y['ticks']['stepSize']), (0, 1500, 300))
        x = self.opcoes('graf-tag')['x']
        self.assertEqual((x['max'], x['ticks']['stepSize']), (1500, 300))

    def test_eixo_cresce_com_os_valores(self):
        self.preparar()
        self.seed('transactions', [tx('u1', 'receita', 600000, '2026-11-05')])
        self.go('dashboards')
        y = self.opcoes('graf-evolucao')['y']
        self.assertEqual((y['max'], y['ticks']['stepSize']), (6000, 1500))

    def test_comparativo_tem_anos_no_eixo(self):
        self.preparar()
        self.seed('transactions', [tx('u1', 'gasto', 90000, '2025-11-05'), tx('u1', 'gasto', 20000, '2025-03-05'),
                                   tx('u1', 'gasto', 150000, '2026-11-05')])
        self.go('dashboards')
        o = self.opcoes('graf-comparativo')
        self.assertEqual(o['labels'], ['2025', '2026'])
        self.assertEqual(o['data'][0], [900, 1500])
        self.assertIn('Novembro', self.page.inner_text('#titulo-comparativo'))
        self.page.select_option('#f-comp-modo', 'ano'); self.pronto()
        o = self.opcoes('graf-comparativo')
        self.assertEqual(o['data'][0], [1100, 1500])
        self.assertIn('ano inteiro', self.page.inner_text('#titulo-comparativo'))

class Chave(UITest):
    def test_chave_publica_ja_vem_no_arquivo(self):
        import pathlib
        html = (pathlib.Path(__file__).resolve().parents[2] / 'index.html').read_text()
        self.assertIn("const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_", html)
        self.assertNotIn('COLE_AQUI', html)
