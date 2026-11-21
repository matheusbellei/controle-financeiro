from harness import UITest


class TestTagsPorPessoa(UITest):
    def test_cada_um_ve_so_as_proprias_tags(self):
        self.open()
        self.seed('tags', [dict(name='Moradia', color='#6F4E37', icon='home', parent_id=None, archived=False, created_by='u1', owner_id='u1'),
                           dict(name='Pilates', color='#5B7A3A', icon='barbell', parent_id=None, archived=False, created_by='u2', owner_id='u2')])
        self.login('ela@x.com', 'senha456')
        self.go('tags')
        texto = self.page.inner_text('#tela-tags')
        self.assertIn('Pilates', texto)
        self.assertNotIn('Moradia', texto)
        self.assertNotIn('vocês dois', texto)

    def test_tag_criada_fica_com_quem_criou(self):
        self.login()
        self.go('tags')
        self.page.click('#tag-nova')
        self.page.fill('#tag-nome', 'Viagem')
        self.page.click('#tag-salvar')
        self.page.wait_for_selector('text=Viagem')
        dono = self.page.evaluate("window.__memdb.tags.find(t => t.name === 'Viagem').owner_id")
        self.assertEqual(dono, 'u1')
