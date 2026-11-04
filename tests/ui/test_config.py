import json, pathlib, tempfile
from harness import UITest

class Config(UITest):
    def preparar(self):
        self.login()
        self.seed('tags', [dict(name='Moradia', color='#6F4E37', icon='home', parent_id=None, archived=False, created_by='u1')])
        tag = self.db('tags')[0]['id']
        self.seed('transactions', [
            dict(owner_id='u1', kind='gasto', amount_cents=150000, description='Aluguel; nov', purchase_date='2026-11-05',
                 competence_date='2026-11-05', tag_id=tag, payment='pix'),
            dict(owner_id='u2', kind='gasto', amount_cents=3000, description='Farmácia', purchase_date='2026-11-06',
                 competence_date='2026-11-06', tag_id=None, payment='debito')])
        self.go('config')

    def baixar(self, botao):
        with self.page.expect_download() as d:
            self.page.click(botao)
        dl = d.value
        path = pathlib.Path(tempfile.mkdtemp()) / dl.suggested_filename
        dl.save_as(path)
        return dl.suggested_filename, path

    def test_mudar_nome_de_exibicao(self):
        self.preparar()
        self.page.fill('#config-nome', 'Matheus B'); self.page.click('#config-salvar-nome'); self.pronto()
        self.assertEqual(next(p for p in self.db('profiles') if p['id'] == 'u1')['name'], 'Matheus B')
        self.assertIn('Matheus', self.page.inner_text('#cabecalho-usuario'))

    def test_exportar_json_tem_tudo(self):
        self.preparar()
        nome, path = self.baixar('#exportar-json')
        self.assertEqual(nome, 'financas-2026-11-02.json')
        data = json.loads(path.read_text())
        self.assertEqual(data['app'], 'controle-financas-pessoais')
        self.assertEqual(len(data['tabelas']['transactions']), 2)
        for t in ['tags', 'transactions', 'recurrences', 'budgets', 'goals', 'goal_deposits', 'profiles']:
            self.assertIn(t, data['tabelas'])

    def test_exportar_csv(self):
        self.preparar()
        nome, path = self.baixar('#exportar-csv')
        self.assertEqual(nome, 'lancamentos-2026-11-02.csv')
        linhas = path.read_text(encoding='utf-8-sig').strip().splitlines()
        self.assertEqual(linhas[0], 'data;competencia;pessoa;tipo;valor;descricao;tag;pagamento')
        self.assertIn('05/11/2026;05/11/2026;Matheus;Gasto;1500,00;"Aluguel; nov";Moradia;Pix', linhas)
        self.assertEqual(len(linhas), 3)

    def test_importar_restaura_so_o_que_falta(self):
        self.preparar()
        _, path = self.baixar('#exportar-json')
        apagado = next(t for t in self.db('transactions') if t['owner_id'] == 'u1')['id']
        self.page.evaluate("(id) => { const db = window.__memdb; db.transactions.splice(db.transactions.findIndex((t) => t.id === id), 1); }", apagado)
        self.page.set_input_files('#importar-json', str(path)); self.pronto()
        self.page.wait_for_selector('#importar-resultado:has-text("importado")')
        self.assertIn('1 lançamento importado', self.page.inner_text('#importar-resultado'))
        self.assertEqual(len(self.db('transactions')), 2)
        self.page.set_input_files('#importar-json', str(path))
        self.page.wait_for_selector('#importar-resultado:has-text("já existiam")')
        self.assertIn('0 lançamentos importados', self.page.inner_text('#importar-resultado'))
        self.assertEqual(len(self.db('transactions')), 2)

    def test_importar_arquivo_invalido(self):
        self.preparar()
        path = pathlib.Path(tempfile.mkdtemp()) / 'x.json'; path.write_text('{"nada": 1}')
        self.page.set_input_files('#importar-json', str(path))
        self.page.wait_for_selector('#importar-resultado:has-text("inválido")')
