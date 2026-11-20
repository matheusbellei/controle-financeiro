from harness import UITest

def tx(kind, valor, compra, comp=None, pag='pix', desc='x'):
    return dict(owner_id='u1', kind=kind, amount_cents=valor, description=desc, purchase_date=compra,
                competence_date=comp or compra, tag_id=None, payment=pag if kind in ('gasto', 'doacao') else None)

class FiltrosMes(UITest):
    def preparar(self):
        self.login()
        self.seed('transactions', [
            tx('gasto', 15391, '2026-10-24', '2026-11-10', 'credito', 'Churrasco'),
            tx('gasto', 2847, '2026-10-31', '2026-11-10', 'credito', 'Cinema'),
            tx('gasto', 592, '2026-11-10', pag='pix', desc='Pão de queijo'),
            tx('gasto', 116666, '2026-11-18', pag='pix', desc='Boleto do cabelo'),
            tx('receita', 132966, '2026-11-20', desc='Salário'),
        ])
        self.page.reload(); self.page.wait_for_selector('#resumo-livre'); self.pronto()

    def itens(self):
        return [t.split('\n')[0] for t in self.page.locator('#lista-mes .item .desc').all_inner_texts()]

    def resumo(self):
        return self.page.inner_text('#resumo-filtro').replace('\xa0', ' ')

    def test_resumo_mostra_total_do_que_esta_na_lista(self):
        self.preparar()
        self.assertIn('5 lançamentos', self.resumo())
        self.assertIn('Saiu R$ 1.354,96', self.resumo())
        self.assertIn('Entrou R$ 1.329,66', self.resumo())

    def test_filtrar_pagamento_mostra_o_total_filtrado(self):
        self.preparar()
        self.page.select_option('#filtro-pag', 'credito')
        self.assertEqual(sorted(self.itens()), ['Churrasco', 'Cinema'])
        self.assertIn('2 lançamentos', self.resumo())
        self.assertIn('Saiu R$ 182,38', self.resumo())
        self.assertNotIn('Entrou', self.resumo())

    def test_ordenar_por_valor(self):
        self.preparar()
        self.page.select_option('#ordem-mes', 'maior')
        self.assertEqual(self.itens()[0], 'Salário')
        self.assertEqual(self.itens()[-1], 'Pão de queijo')
        self.page.select_option('#ordem-mes', 'menor')
        self.assertEqual(self.itens()[0], 'Pão de queijo')

    def test_ordenar_por_data(self):
        self.preparar()
        self.page.select_option('#ordem-mes', 'antiga')
        self.assertEqual(self.itens()[0], 'Churrasco')
        self.page.select_option('#ordem-mes', 'recente')
        self.assertEqual(self.itens()[0], 'Salário')

    def test_mais_filtros_data_da_compra(self):
        self.preparar(); p = self.page
        self.assertFalse(p.is_visible('#filtro-de'))
        p.click('#mais-filtros')
        p.fill('#filtro-de', '2026-11-01'); p.dispatch_event('#filtro-de', 'input')
        p.fill('#filtro-ate', '2026-11-15'); p.dispatch_event('#filtro-ate', 'input')
        self.assertEqual(self.itens(), ['Pão de queijo'])
        self.assertIn('1 lançamento ', self.resumo() + ' ')

    def test_mais_filtros_valor_minimo_e_maximo(self):
        self.preparar(); p = self.page
        p.click('#mais-filtros')
        p.fill('#filtro-min', '20'); p.fill('#filtro-max', '200')
        self.assertEqual(sorted(self.itens()), ['Churrasco', 'Cinema'])

    def test_limpar_filtros(self):
        self.preparar(); p = self.page
        p.select_option('#filtro-pag', 'pix'); p.click('#mais-filtros'); p.fill('#filtro-min', '100')
        p.click('#limpar-filtros')
        self.assertEqual(len(self.itens()), 5)
        self.assertEqual(p.input_value('#filtro-pag'), '')
        self.assertEqual(p.input_value('#filtro-min'), '')

    def test_cabe_no_celular(self):
        self.preparar(); self.page.click('#mais-filtros')
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 390)
