from harness import UITest

class Blocos(UITest):
    def preparar(self):
        self.login()
        self.seed('tags', [dict(name='Academia', color='#5B7A3A', icon='barbell', parent_id=None, archived=False, created_by='u1'),
                           dict(name='Moradia', color='#F1C40F', icon='home', parent_id=None, archived=False, created_by='u1'),
                           dict(name='Antiga', color='#9E9E9E', icon='tag', parent_id=None, archived=True, created_by='u1')])
        self.t = {x['name']: x['id'] for x in self.db('tags')}
        self.seed('tags', [dict(name='Mensalidade', color='#C68B59', icon='receipt', parent_id=self.t['Academia'], archived=False, created_by='u1'),
                           dict(name='Suplemento', color='#A68A73', icon='bottle', parent_id=self.t['Academia'], archived=False, created_by='u1')])
        self.seed('budgets', [dict(owner_id='u1', tag_id=self.t['Academia'], monthly_cents=12000)])

    def test_tags_em_blocos_com_subtags_dentro(self):
        self.preparar(); self.go('tags')
        blocos = self.page.locator('#lista-tags .bloco')
        self.assertEqual(blocos.count(), 3)
        academia = self.page.locator('#lista-tags .bloco', has_text='Academia')
        txt = academia.inner_text().replace('\xa0', ' ')
        self.assertIn('Mensalidade', txt); self.assertIn('Suplemento', txt); self.assertIn('R$ 120,00', txt)
        self.assertIn('Sem limite', self.page.locator('#lista-tags .bloco', has_text='Moradia').inner_text())

    def test_arquivadas_ficam_por_ultimo_e_separadas(self):
        self.preparar(); self.go('tags')
        nomes = self.page.locator('#lista-tags .bloco .tag-nome').all_inner_texts()
        self.assertEqual(nomes[-1], 'Antiga')
        self.assertEqual(self.page.locator('#lista-tags .bloco.arquivada').count(), 1)

    def test_subtags_aparecem_dentro_do_bloco_com_acoes(self):
        self.preparar(); self.go('tags')
        academia = self.bloco('Academia')
        self.assertEqual(academia.locator('.sub-linha').count(), 2)
        self.assertEqual(academia.locator('.sub-linha .tag-editar').count(), 2)
        self.assertEqual(academia.locator('.sub-linha .tag-excluir').count(), 2)
        self.assertEqual(self.bloco('Moradia').locator('.sub-linha').count(), 0)
        self.assertEqual(self.bloco('Antiga').locator('.bloco-nova-sub').count(), 0)

    def test_botao_do_bloco_cria_subtag_ja_na_tag(self):
        self.preparar(); self.go('tags')
        p = self.page
        self.nova_subtag('Moradia')
        self.assertEqual(p.input_value('#subtag-tag'), self.t['Moradia'])
        p.fill('#subtag-nome', 'Internet'); p.click('#subtag-salvar'); p.wait_for_selector('#modal-fundo', state='hidden'); self.pronto()
        self.assertIn('Internet', self.bloco('Moradia').inner_text())

    def test_blocos_cabem_no_celular(self):
        self.preparar(); self.go('tags')
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 390)
