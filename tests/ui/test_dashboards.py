from harness import UITest

def tx(owner, kind, valor, comp, tag=None, pag='pix'):
    return dict(owner_id=owner, kind=kind, amount_cents=valor, description=kind, purchase_date=comp,
                competence_date=comp, tag_id=tag, payment=pag if kind == 'gasto' else None)

class Dash(UITest):
    def preparar(self):
        self.login()
        self.seed('tags', [dict(name='Alimentação', color='#C68B59', icon='coffee', parent_id=None, archived=False, created_by='u1'),
                           dict(name='Moradia', color='#6F4E37', icon='home', parent_id=None, archived=False, created_by='u1')])
        ids = {t['name']: t['id'] for t in self.db('tags')}
        self.seed('tags', [dict(name='Mercado', color='#D4A373', icon='shopping-cart', parent_id=ids['Alimentação'], archived=False, created_by='u1')])
        self.t = {t['name']: t['id'] for t in self.db('tags')}
        self.seed('transactions', [
            tx('u1', 'gasto', 50000, '2026-11-03', self.t['Mercado']),
            tx('u1', 'gasto', 20000, '2026-11-04', self.t['Alimentação']),
            tx('u1', 'gasto', 150000, '2026-11-05', self.t['Moradia']),
            tx('u1', 'investimento', 80000, '2026-11-06', self.t['Moradia']),
            tx('u1', 'receita', 600000, '2026-11-05'),
            tx('u1', 'investimento', 100000, '2026-03-10'),
            tx('u1', 'gasto', 90000, '2025-11-05', self.t['Moradia']),
            tx('u2', 'gasto', 30000, '2026-11-07', self.t['Moradia']),
        ])

    def chart(self, canvas_id):
        return self.page.evaluate("""(id) => { const c = (window.__charts || []).find((x) => x.__canvas === id);
            return c ? JSON.parse(JSON.stringify({labels: c.data.labels, datasets: c.data.datasets.map((d) => ({label: d.label, data: d.data}))})) : null; }""", canvas_id)

    def test_gasto_por_tag_no_mes_soma_subtag_e_ignora_investimento(self):
        self.preparar(); self.go('dashboards')
        c = self.chart('graf-tag')
        d = dict(zip(c['labels'], c['datasets'][0]['data']))
        self.assertEqual(d, {'Moradia': 1500, 'Alimentação': 700})
        self.assertEqual(c['labels'][0], 'Moradia')

    def test_abrir_tag_mostra_subtags(self):
        self.preparar(); self.go('dashboards')
        self.page.click(f'.dash-tag[data-tag="{self.t["Alimentação"]}"]'); self.pronto()
        c = self.chart('graf-subtag')
        self.assertEqual(dict(zip(c['labels'], c['datasets'][0]['data'])), {'Mercado': 500, 'Alimentação (direto)': 200})

    def test_juntos_inclui_a_outra_pessoa(self):
        self.preparar(); self.go('dashboards')
        self.page.click('#tela-dashboards [data-ver="juntos"]'); self.pronto()
        d = dict(zip(*[self.chart('graf-tag')[k] for k in ('labels',)], self.chart('graf-tag')['datasets'][0]['data']))
        self.assertEqual(d['Moradia'], 1800)

    def test_periodo_ano(self):
        self.preparar(); self.go('dashboards')
        self.page.select_option('#f-tag-periodo', 'ano'); self.pronto()
        d = dict(zip(self.chart('graf-tag')['labels'], self.chart('graf-tag')['datasets'][0]['data']))
        self.assertEqual(d['Moradia'], 1500)

    def test_evolucao_mes_a_mes(self):
        self.preparar(); self.go('dashboards')
        c = self.chart('graf-evolucao')
        self.assertEqual([x['label'] for x in c['datasets']], ['Entrou', 'Saiu', 'Investido', 'Doado'])
        self.assertEqual(len(c['labels']), 12)
        self.assertEqual(c['datasets'][1]['data'][10], 2200)
        self.assertEqual(c['datasets'][2]['data'][2], 1000)

    def test_comparativo_entre_anos(self):
        self.preparar(); self.go('dashboards')
        c = self.chart('graf-comparativo')
        self.assertEqual(c['labels'], ['2025', '2026'])
        self.assertEqual(c['datasets'][0]['data'], [900, 2200])

    def test_aportes_do_ano(self):
        self.preparar(); self.go('dashboards')
        self.assertIn('R$ 1.800,00', self.page.inner_text('#aportes-total').replace('\xa0', ' '))
        c = self.chart('graf-aportes')
        self.assertEqual(c['datasets'][0]['data'][2], 1000)

    def test_total_do_mes_bate_com_tela_mes(self):
        self.preparar(); self.go('dashboards')
        dash = self.page.inner_text('#dash-total-gasto')
        self.go('mes')
        self.assertEqual(dash, self.page.inner_text('#resumo-saiu'))

    def test_ano_mostra_12_meses_e_abre_o_mes(self):
        self.preparar(); self.go('ano')
        self.assertEqual(self.page.locator('#grade-ano .mes-ano').count(), 12)
        nov = self.page.inner_text('#grade-ano .mes-ano[data-mes="11"]').replace('\xa0', ' ')
        self.assertIn('R$ 6.000,00', nov); self.assertIn('R$ 2.200,00', nov); self.assertIn('R$ 3.000,00', nov)
        self.page.click('#grade-ano .mes-ano[data-mes="3"]'); self.page.wait_for_selector('#tela-mes', state='visible'); self.pronto()
        self.assertIn('Março 2026', self.page.inner_text('#mes-titulo'))

    def test_ano_troca_de_ano(self):
        self.preparar(); self.go('ano')
        self.page.click('#ano-anterior'); self.pronto()
        self.assertIn('2025', self.page.inner_text('#ano-titulo'))
        self.assertIn('R$ 900,00', self.page.inner_text('#grade-ano .mes-ano[data-mes="11"]').replace('\xa0', ' '))
