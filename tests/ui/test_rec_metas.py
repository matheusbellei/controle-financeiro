from harness import UITest

class Recorrentes(UITest):
    def criar(self, valor, desc, dia, pag='pix', inicio='2026-11', tipo=None):
        p = self.page
        p.click('#rec-novo'); p.wait_for_selector('#rec-valor')
        if tipo: p.click(f'#modal [data-tipo="{tipo}"]')
        p.fill('#rec-valor', valor); p.fill('#rec-desc', desc); p.fill('#rec-dia', str(dia))
        if pag: p.click(f'#modal [data-pag="{pag}"]')
        p.fill('#rec-inicio', inicio)
        p.click('#rec-salvar'); p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()

    def mes(self, delta):
        self.go('mes')
        for _ in range(abs(delta)):
            self.page.click('#mes-seguinte' if delta > 0 else '#mes-anterior'); self.pronto()
        return self.page.inner_text('#lista-mes')

    def test_criar_aparece_na_lista(self):
        self.login(); self.go('recorrentes'); self.criar('1500', 'Aluguel', 5)
        txt = self.page.inner_text('#lista-rec').replace('\xa0', ' ')
        self.assertIn('Aluguel', txt); self.assertIn('dia 5', txt); self.assertIn('R$ 1.500,00', txt)
        r = self.db('recurrences')[0]
        self.assertEqual((r['amount_cents'], r['day_of_month'], r['start_month'], r['payment']), (150000, 5, '2026-11-01', 'pix'))

    def test_recorrente_no_credito_entra_no_mes_seguinte(self):
        self.login(); self.go('recorrentes'); self.criar('800', 'Aluguel', 5, pag='credito')
        self.assertNotIn('Aluguel', self.mes(0))
        self.assertIn('Aluguel', self.mes(1))
        t = self.db('transactions')[0]
        self.assertEqual((t['purchase_date'], t['competence_date']), ('2026-11-05', '2026-12-10'))

    def test_pausar_para_de_gerar(self):
        self.login(); self.go('recorrentes'); self.criar('50', 'Streaming', 15)
        self.page.locator('#lista-rec .rec-linha', has_text='Streaming').locator('.rec-pausar').click(); self.pronto()
        self.assertTrue(self.db('recurrences')[0]['paused'])
        self.assertNotIn('Streaming', self.mes(0))

    def test_encerrar_vale_a_partir_do_mes_seguinte(self):
        self.login(); self.go('recorrentes'); self.criar('50', 'Academia', 10)
        self.page.locator('#lista-rec .rec-linha', has_text='Academia').locator('.rec-encerrar').click()
        self.page.click('#rec-encerrar-confirmar'); self.page.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        self.assertEqual(self.db('recurrences')[0]['end_month'], '2026-11-01')
        self.assertIn('Academia', self.mes(0))
        self.assertNotIn('Academia', self.mes(1))

    def test_editar_nao_muda_lancamentos_ja_criados(self):
        self.login(); self.go('recorrentes'); self.criar('100', 'Internet', 20)
        self.mes(0); self.go('recorrentes')
        self.page.locator('#lista-rec .rec-linha', has_text='Internet').locator('.rec-editar').click()
        self.page.fill('#rec-valor', '120'); self.page.click('#rec-salvar')
        self.page.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        self.assertEqual(self.db('recurrences')[0]['amount_cents'], 12000)
        self.assertEqual(self.db('transactions')[0]['amount_cents'], 10000)
        self.mes(0)
        self.assertEqual([t['amount_cents'] for t in self.db('transactions')], [10000])

    def test_mes_futuro_nao_gera_recorrente(self):
        self.login(); self.go('recorrentes'); self.criar('6000', 'Salário', 5, pag=None, tipo='receita')
        self.assertNotIn('Salário', self.mes(2))
        self.assertEqual([t['competence_date'] for t in self.db('transactions')], ['2026-11-05'])

    def test_salario_recorrente(self):
        self.login(); self.go('recorrentes'); self.criar('6000', 'Salário', 5, pag=None, tipo='receita')
        self.assertIsNone(self.db('recurrences')[0]['payment'])
        self.mes(0)
        self.assertIn('R$ 6.000,00', self.page.inner_text('#resumo-entrou').replace('\xa0', ' '))

    def test_dia_invalido(self):
        self.login(); self.go('recorrentes')
        p = self.page
        p.click('#rec-novo'); p.fill('#rec-valor', '10'); p.fill('#rec-dia', '40'); p.click('#rec-salvar')
        self.assertIn('dia entre 1 e 31', p.inner_text('#rec-erro'))


class Metas(UITest):
    def criar(self, nome, alvo, prazo):
        p = self.page
        p.click('#meta-nova'); p.fill('#meta-nome', nome); p.fill('#meta-alvo', alvo); p.fill('#meta-prazo', prazo)
        p.click('#meta-salvar'); p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()

    def guardar(self, nome, valor):
        p = self.page
        p.locator('#lista-metas .meta', has_text=nome).locator('.meta-guardar').click()
        p.fill('#dep-valor', valor); p.click('#dep-salvar'); p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()

    def test_criar_e_guardar_mostra_progresso(self):
        self.login(); self.go('metas'); self.criar('Viagem', '10.000', '2027-06')
        self.guardar('Viagem', '3000'); self.guardar('Viagem', '1200')
        txt = self.page.inner_text('#lista-metas').replace('\xa0', ' ')
        self.assertIn('R$ 4.200,00 de R$ 10.000,00', txt)
        self.assertIn('até jun/2027', txt)
        self.assertIn('42%', txt)

    def test_excluir_meta_remove_depositos(self):
        self.login(); self.go('metas'); self.criar('Carro', '50000', '2028-01'); self.guardar('Carro', '100')
        self.page.locator('#lista-metas .meta', has_text='Carro').locator('.meta-excluir').click()
        self.page.click('#meta-excluir-confirmar'); self.page.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        self.assertEqual(self.db('goals'), []); self.assertEqual(self.db('goal_deposits'), [])

    def test_meta_da_outra_pessoa_so_leitura(self):
        self.login()
        self.seed('goals', [dict(owner_id='u2', name='Curso', target_cents=200000, deadline='2027-03-01')])
        self.go('metas')
        self.page.click('#tela-metas [data-ver="ela"]'); self.pronto()
        meta = self.page.locator('#lista-metas .meta', has_text='Curso')
        self.assertEqual(meta.count(), 1)
        self.assertEqual(meta.locator('.meta-guardar, .meta-excluir').count(), 0)

    def test_alvo_obrigatorio(self):
        self.login(); self.go('metas')
        self.page.click('#meta-nova'); self.page.fill('#meta-nome', 'X'); self.page.click('#meta-salvar')
        self.assertIn('valor da meta', self.page.inner_text('#meta-erro'))
