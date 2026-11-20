import json, pathlib, tempfile
from harness import UITest

def tx(owner, kind, valor, comp, tag=None, pag='pix', desc=None):
    return dict(owner_id=owner, kind=kind, amount_cents=valor, description=desc or kind, purchase_date=comp,
                competence_date=comp, tag_id=tag, payment=pag if kind in ('gasto', 'doacao') else None)

def base_tags(t):
    t.seed('tags', [dict(name='Renda extra', color='#5B7A3A', icon='cash', parent_id=None, archived=False, created_by='u1'),
                    dict(name='Academia', color='#C68B59', icon='barbell', parent_id=None, archived=False, created_by='u1'),
                    dict(name='Saúde', color='#B5543A', icon='pill', parent_id=None, archived=False, created_by='u1')])
    ids = {x['name']: x['id'] for x in t.db('tags')}
    t.seed('tags', [dict(name='Ajuda da família para o boleto do cabelo e outras coisas', color='#7A8B5A', icon='users',
                         parent_id=ids['Renda extra'], archived=False, created_by='u1'),
                    dict(name='Design', color='#7A8B5A', icon='brush', parent_id=ids['Renda extra'], archived=False, created_by='u1'),
                    dict(name='Mensalidade', color='#D4A373', icon='barbell', parent_id=ids['Academia'], archived=False, created_by='u1'),
                    dict(name='Equipamento', color='#D4A373', icon='tool', parent_id=ids['Academia'], archived=False, created_by='u1')])
    return {x['name']: x['id'] for x in t.db('tags')}

class Celular(UITest):
    def test_nenhuma_tela_fica_mais_larga_que_o_celular(self):
        self.login(); t = base_tags(self)
        self.seed('transactions', [
            tx('u1', 'receita', 50000, '2026-11-03', t['Ajuda da família para o boleto do cabelo e outras coisas'],
               desc='Ajuda da família para pagar o boleto do cabelo do mês de novembro'),
            tx('u1', 'gasto', 10000, '2026-11-04', t['Mensalidade'], desc='Mensalidade academia'),
        ])
        self.seed('budgets', [dict(owner_id='u1', tag_id=t['Renda extra'], monthly_cents=50000)])
        largura = "() => document.documentElement.scrollWidth"
        for tela in ['mes', 'dashboards', 'ano', 'metas', 'recorrentes', 'tags', 'config']:
            self.go(tela)
            self.assertLessEqual(self.page.evaluate(largura), 390, tela)
        self.go('mes')
        self.page.select_option('#filtro-tag', label='Renda extra'); self.pronto()
        self.assertLessEqual(self.page.evaluate(largura), 390, 'filtro de subtag')
        self.page.click('#novo-lancamento')
        self.page.select_option('#lanc-tag', label='Renda extra')
        self.assertLessEqual(self.page.evaluate(largura), 390, 'formulário')

class FiltroTag(UITest):
    def preparar(self):
        self.login(); self.t = base_tags(self)
        self.seed('transactions', [tx('u1', 'gasto', 10000, '2026-11-04', self.t['Mensalidade'], desc='Mensalidade'),
                                   tx('u1', 'gasto', 20000, '2026-11-05', self.t['Equipamento'], desc='Halter'),
                                   tx('u1', 'gasto', 3000, '2026-11-06', self.t['Saúde'], desc='Remédio')])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()

    def opcoes(self, sel):
        return self.page.eval_on_selector_all(f'{sel} option', 'os => os.map((o) => o.textContent.trim())')

    def test_filtro_mostra_so_tags_e_depois_subtags(self):
        self.preparar()
        self.assertEqual(self.opcoes('#filtro-tag'), ['Todas as tags', 'Academia', 'Renda extra', 'Saúde'])
        self.assertFalse(self.page.is_visible('#filtro-subtag'))
        self.page.select_option('#filtro-tag', label='Academia'); self.pronto()
        lista = self.page.inner_text('#lista-mes')
        self.assertIn('Mensalidade', lista); self.assertIn('Halter', lista); self.assertNotIn('Remédio', lista)
        self.assertTrue(self.page.is_visible('#filtro-subtag'))
        self.assertEqual(self.opcoes('#filtro-subtag'), ['Todas as subtags', 'Equipamento', 'Mensalidade'])
        self.page.select_option('#filtro-subtag', label='Equipamento'); self.pronto()
        lista = self.page.inner_text('#lista-mes')
        self.assertIn('Halter', lista); self.assertNotIn('Mensalidade', lista)

    def test_tag_sem_subtag_nao_mostra_segundo_filtro(self):
        self.preparar()
        self.page.select_option('#filtro-tag', label='Saúde'); self.pronto()
        self.assertFalse(self.page.is_visible('#filtro-subtag'))
        self.assertIn('Remédio', self.page.inner_text('#lista-mes'))

class FormTag(UITest):
    def opcoes(self, sel):
        return self.page.eval_on_selector_all(f'{sel} option', 'os => os.map((o) => o.textContent.trim())')

    def test_lancamento_escolhe_tag_e_depois_subtag(self):
        self.login(); t = base_tags(self)
        self.seed('transactions', [tx('u1', 'gasto', 100, '2026-11-01', t['Mensalidade'])])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()
        p = self.page
        p.click('#novo-lancamento')
        self.assertEqual(p.locator('#lanc-tag optgroup').count(), 0)
        self.assertEqual(self.opcoes('#lanc-tag'), ['Sem tag', 'Academia', 'Renda extra', 'Saúde', '+ Nova tag…'])
        self.assertFalse(p.is_visible('#lanc-subtag'))
        p.select_option('#lanc-tag', label='Academia')
        self.assertEqual(self.opcoes('#lanc-subtag'), ['Sem subtag', 'Equipamento', 'Mensalidade', '+ Nova subtag…'])
        p.select_option('#lanc-subtag', label='Equipamento')
        p.fill('#lanc-valor', '50'); p.fill('#lanc-desc', 'Corda'); p.click('#lanc-salvar')
        p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        nova = next(x for x in self.db('transactions') if x['description'] == 'Corda')
        self.assertEqual(nova['tag_id'], t['Equipamento'])

    def test_sem_subtag_grava_a_tag(self):
        self.login(); t = base_tags(self)
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()
        p = self.page
        p.click('#novo-lancamento'); p.select_option('#lanc-tag', label='Academia')
        p.fill('#lanc-valor', '50'); p.click('#lanc-salvar'); p.wait_for_selector('#modal-fundo', state='hidden')
        self.assertEqual(self.db('transactions')[0]['tag_id'], t['Academia'])

    def test_editar_abre_com_tag_e_subtag_escolhidas(self):
        self.login(); t = base_tags(self)
        self.seed('transactions', [tx('u1', 'gasto', 100, '2026-11-01', t['Design'], desc='Logo')])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()
        self.page.locator('#lista-mes .item', has_text='Logo').locator('.editar').click()
        self.assertEqual(self.page.input_value('#lanc-tag'), t['Renda extra'])
        self.assertEqual(self.page.input_value('#lanc-subtag'), t['Design'])

    def test_recorrente_tambem_escolhe_tag_e_subtag(self):
        self.login(); t = base_tags(self); self.go('recorrentes')
        p = self.page
        p.click('#rec-novo'); p.select_option('#rec-tag', label='Academia'); p.select_option('#rec-subtag', label='Mensalidade')
        p.fill('#rec-valor', '100'); p.fill('#rec-dia', '5'); p.click('#rec-salvar'); p.wait_for_selector('#modal-fundo', state='hidden')
        self.assertEqual(self.db('recurrences')[0]['tag_id'], t['Mensalidade'])

class Privado(UITest):
    def test_sem_opcao_de_ver_a_outra_pessoa_em_nenhuma_tela(self):
        self.login()
        for tela in ['mes', 'dashboards', 'ano', 'metas']:
            self.go(tela)
            self.assertEqual(self.page.locator(f'#tela-{tela} [data-ver]').count(), 0, tela)
            self.assertNotIn('Denise', self.page.inner_text(f'#tela-{tela}'), tela)

    def test_ano_e_dashboard_so_com_os_meus(self):
        self.login()
        self.seed('transactions', [tx('u2', 'gasto', 70000, '2026-11-05'), tx('u1', 'gasto', 10000, '2026-11-05')])
        self.go('ano')
        self.assertIn('Saiu R$ 100,00', self.page.inner_text('#grade-ano .mes-ano[data-mes="11"]').replace('\xa0', ' '))

    def test_denise_ve_so_o_dela(self):
        self.login('ela@x.com', 'senha456')
        self.seed('transactions', [tx('u1', 'gasto', 70000, '2026-11-05', desc='Do Matheus'), tx('u2', 'gasto', 2000, '2026-11-05', desc='Da Denise')])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()
        self.assertEqual(self.page.inner_text('#cabecalho-usuario'), 'Denise')
        lista = self.page.inner_text('#lista-mes')
        self.assertIn('Da Denise', lista); self.assertNotIn('Do Matheus', lista)
        self.assertNotIn('Matheus', self.page.inner_text('#tela-mes'))

    def test_backup_e_csv_so_com_os_meus_dados(self):
        self.login()
        self.seed('transactions', [tx('u1', 'gasto', 100, '2026-11-05', desc='meu'), tx('u2', 'gasto', 200, '2026-11-05', desc='dela')])
        self.seed('goals', [dict(owner_id='u2', name='Dela', target_cents=100, deadline=None)])
        self.go('config')
        with self.page.expect_download() as d: self.page.click('#exportar-json')
        path = pathlib.Path(tempfile.mkdtemp()) / 'b.json'; d.value.save_as(path)
        dados = json.loads(path.read_text())['tabelas']
        self.assertEqual([x['description'] for x in dados['transactions']], ['meu'])
        self.assertEqual(dados['goals'], [])
        self.assertEqual([x['id'] for x in dados['profiles']], ['u1'])
        with self.page.expect_download() as d: self.page.click('#exportar-csv')
        path = pathlib.Path(tempfile.mkdtemp()) / 'c.csv'; d.value.save_as(path)
        self.assertNotIn('dela', path.read_text(encoding='utf-8-sig'))

class OrcamentoReceita(UITest):
    def test_tag_de_receita_mostra_quanto_entrou_da_meta(self):
        self.login(); t = base_tags(self)
        self.seed('budgets', [dict(owner_id='u1', tag_id=t['Renda extra'], monthly_cents=50000),
                              dict(owner_id='u1', tag_id=t['Saúde'], monthly_cents=30000)])
        self.seed('transactions', [tx('u1', 'receita', 30000, '2026-11-03', t['Design'], desc='Logo')])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()
        linha = self.page.locator(f'#orcamentos .orcamento[data-tag="{t["Renda extra"]}"]')
        self.assertIn('Entrou R$ 300,00 de R$ 500,00', linha.inner_text().replace('\xa0', ' '))
        self.assertEqual(linha.locator('.barra.receita').count(), 1)
        saude = self.page.locator(f'#orcamentos .orcamento[data-tag="{t["Saúde"]}"]').inner_text().replace('\xa0', ' ')
        self.assertIn('R$ 0,00 de R$ 300,00', saude)

    def test_receita_mostra_a_tag_na_lista(self):
        self.login(); t = base_tags(self)
        self.seed('transactions', [tx('u1', 'receita', 30000, '2026-11-03', t['Design'], desc='Logo')])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()
        self.assertIn('Receita · Renda extra › Design', self.page.inner_text('#lista-mes'))
