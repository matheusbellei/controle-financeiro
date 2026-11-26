from harness import UITest

FRASES = [dict(owner_id=None, texto='Preço é o que você paga.', autor='Warren Buffett'),
          dict(owner_id=None, texto='Seja medroso quando os outros estão gananciosos.', autor='Warren Buffett'),
          dict(owner_id=None, texto='O dinheiro grande está em esperar.', autor='Charlie Munger'),
          dict(owner_id='u2', texto='Frase da Denise.', autor='Denise')]


class Lembrete(UITest):
    def preparar(self):
        self.login()
        self.seed('frases', FRASES)
        self.go('config')

    def cfg(self):
        return next((c for c in self.db('lembrete_config') if c['owner_id'] == 'u1'), None)

    def salvo(self):
        self.page.wait_for_selector('#lembrete-status:has-text("Salvo")')

    def funcoes(self):
        return self.page.evaluate('window.__memFuncoes || []')

    def test_ativar_e_desativar_neste_aparelho(self):
        self.preparar()
        p = self.page
        self.assertIn('ainda não recebe', p.inner_text('#lembrete-aparelho'))
        p.click('#lembrete-ativar-aparelho')
        p.wait_for_selector('#lembrete-aparelho:has-text("Este aparelho recebe")')
        insc = self.db('push_inscricoes')
        self.assertEqual(len(insc), 1)
        self.assertEqual(insc[0]['owner_id'], 'u1')
        self.assertEqual(insc[0]['endpoint'], 'https://push.teste/aparelho-1')
        self.assertEqual((insc[0]['p256dh'], insc[0]['auth']), ('chave-p256dh', 'segredo-auth'))
        # pediu a chave pública à função e usou-a para inscrever o aparelho
        self.assertEqual(self.funcoes()[0], ['lembrete-diario', 'GET', None])
        self.assertEqual(p.evaluate('window.__pushChaveUsada'), [4, 1, 2, 3])
        # ligar o aparelho também liga o lembrete
        self.assertTrue(self.cfg()['ativo'])
        p.click('#lembrete-desativar-aparelho')
        p.wait_for_selector('#lembrete-aparelho:has-text("ainda não recebe")')
        self.assertEqual(self.db('push_inscricoes'), [])

    def test_permissao_negada_explica_o_que_fazer(self):
        self.page.add_init_script('window.__pushNegar = true')
        self.preparar()
        self.page.click('#lembrete-ativar-aparelho')
        self.page.wait_for_selector('#lembrete-aparelho:has-text("bloqueou")')
        self.assertEqual(self.db('push_inscricoes'), [])

    def test_iphone_sem_instalar_pede_para_instalar(self):
        self.page.add_init_script('window.__pushPrecisaInstalar = true')
        self.preparar()
        self.assertIn('Tela de Início', self.page.inner_text('#lembrete-aparelho'))
        self.assertEqual(self.page.locator('#lembrete-ativar-aparelho').count(), 0)

    def salvar(self):
        self.page.click('#lembrete-salvar')
        self.page.wait_for_selector('#lembrete-status:has-text("Salvo")')

    def test_so_salva_ao_tocar_em_salvar_e_volta_depois(self):
        self.preparar()
        p = self.page
        p.check('#lembrete-ativo')
        p.fill('#lembrete-hora', '07:30'); p.dispatch_event('#lembrete-hora', 'change')
        p.click('#lembrete-dias [data-dia="7"]')
        p.uncheck('#lembrete-pular')
        p.fill('#lembrete-titulo', 'Bora lançar')
        p.fill('#lembrete-mensagem', 'Rapidinho!')
        p.wait_for_selector('#lembrete-status:has-text("Alterações não salvas")')
        self.assertIsNone(self.cfg(), 'nada vai para o banco antes de Salvar')
        self.salvar()
        c = self.cfg()
        self.assertEqual((c['ativo'], c['hora'], c['dias'], c['pular_se_lancou'], c['titulo'], c['mensagem']),
                         (True, '07:30', [1, 2, 3, 4, 5, 6], False, 'Bora lançar', 'Rapidinho!'))
        p.reload(); self.pronto(); self.go('config')
        self.assertTrue(p.is_checked('#lembrete-ativo'))
        self.assertEqual(p.input_value('#lembrete-hora'), '07:30')
        self.assertEqual(p.get_attribute('#lembrete-dias [data-dia="7"]', 'aria-pressed'), 'false')
        self.assertEqual(p.get_attribute('#lembrete-dias [data-dia="1"]', 'aria-pressed'), 'true')
        self.assertFalse(p.is_checked('#lembrete-pular'))
        self.assertIn('Cancelar a notificação se já houver um lançamento no dia', p.inner_text('#lembrete-cartao'))
        self.assertEqual(p.input_value('#lembrete-titulo'), 'Bora lançar')
        self.assertEqual(p.inner_text('#lembrete-status'), '')

    def test_sem_nenhum_dia_nao_salva(self):
        self.preparar()
        p = self.page
        for d in range(1, 8):
            p.click(f'#lembrete-dias [data-dia="{d}"]')
        p.click('#lembrete-salvar')
        p.wait_for_selector('#lembrete-status:has-text("pelo menos um dia")')
        self.assertIsNone(self.cfg())

    def test_titulo_vazio_nao_salva(self):
        self.preparar()
        self.page.fill('#lembrete-titulo', '  ')
        self.page.click('#lembrete-salvar')
        self.page.wait_for_selector('#lembrete-status:has-text("título")')
        self.assertIsNone(self.cfg())

    def test_previa_acompanha_sem_salvar(self):
        self.preparar()
        p = self.page
        previa = p.inner_text('#lembrete-previa')
        self.assertIn('Hora de lançar os gastos', previa)
        self.assertIn('Leva um minuto', previa)
        self.assertRegex(previa, r'“.+” — (Warren Buffett|Charlie Munger)')
        p.fill('#lembrete-titulo', 'Bora!')
        self.assertIn('Bora!', p.inner_text('#lembrete-previa'))
        p.uncheck('#frase-ativa')
        self.assertNotIn('“', p.inner_text('#lembrete-previa'))
        self.assertIsNone(self.cfg())

    def test_frases_origem_autores_e_minhas(self):
        self.preparar()
        p = self.page
        texto = p.inner_text('#lembrete-cartao')
        self.assertIn('Warren Buffett (2)', texto)
        self.assertIn('Charlie Munger (1)', texto)
        self.assertNotIn('Frase da Denise', p.inner_text('#app'))
        p.click('#frase-autores [data-autor="Charlie Munger"]')
        self.assertEqual(p.get_attribute('#frase-autores [data-autor="Charlie Munger"]', 'aria-pressed'), 'false')
        p.select_option('#frase-fonte', 'minhas')
        self.assertIsNone(self.cfg())
        self.salvar()
        self.assertEqual(self.cfg()['autores_desligados'], ['Charlie Munger'])
        self.assertEqual(self.cfg()['fonte_frases'], 'minhas')

        p.fill('#frase-nova-texto', 'Pague-se primeiro.'); p.fill('#frase-nova-autor', 'Eu')
        p.click('#frase-adicionar')
        p.wait_for_selector('#minhas-frases :text("Pague-se primeiro.")')
        minha = next(f for f in self.db('frases') if f['owner_id'] == 'u1')
        self.assertEqual((minha['texto'], minha['autor']), ('Pague-se primeiro.', 'Eu'))
        self.assertIn('“Pague-se primeiro.” — Eu', p.inner_text('#lembrete-previa'))

        p.click('#minhas-frases .frase-editar')
        p.fill('#frase-edit-texto', 'Pague-se primeiro, sempre.')
        p.click('#frase-edit-salvar')
        p.wait_for_selector('#minhas-frases :text("Pague-se primeiro, sempre.")')
        self.assertEqual(next(f for f in self.db('frases') if f['owner_id'] == 'u1')['texto'], 'Pague-se primeiro, sempre.')

        p.click('#minhas-frases .frase-excluir')
        p.wait_for_selector('#minhas-frases :text("Nenhuma frase sua ainda")')
        self.assertEqual([f for f in self.db('frases') if f['owner_id'] == 'u1'], [])

    def test_frase_vazia_nao_entra(self):
        self.preparar()
        self.page.click('#frase-adicionar')
        self.page.wait_for_selector('#frase-erro:has-text("Escreva a frase")')
        self.assertEqual([f for f in self.db('frases') if f['owner_id'] == 'u1'], [])

    def test_enviar_teste(self):
        self.preparar()
        p = self.page
        p.click('#lembrete-testar')
        p.wait_for_selector('#aviso:has-text("Ative as notificações neste aparelho")')
        p.click('#lembrete-ativar-aparelho')
        p.wait_for_selector('#lembrete-aparelho:has-text("Este aparelho recebe")')
        p.click('#lembrete-testar')
        p.wait_for_selector('#aviso:has-text("Teste enviado")')
        self.assertIn(['lembrete-diario', 'POST', {'acao': 'teste'}], self.funcoes())

    def test_teste_com_alteracoes_nao_salvas_pede_para_salvar(self):
        self.preparar()
        p = self.page
        p.click('#lembrete-ativar-aparelho')
        p.wait_for_selector('#lembrete-aparelho:has-text("Este aparelho recebe")')
        p.fill('#lembrete-titulo', 'Novo título')
        n = len(self.funcoes())
        p.click('#lembrete-testar')
        p.wait_for_selector('#lembrete-status:has-text("Salve as alterações antes de testar")')
        self.assertEqual(len(self.funcoes()), n)

    def test_ativar_aparelho_nao_salva_o_rascunho(self):
        self.preparar()
        p = self.page
        p.fill('#lembrete-titulo', 'Rascunho')
        p.click('#lembrete-ativar-aparelho')
        p.wait_for_selector('#lembrete-aparelho:has-text("Este aparelho recebe")')
        c = self.cfg()
        self.assertTrue(c['ativo'])
        self.assertEqual(c['titulo'], 'Hora de lançar os gastos')
        self.assertEqual(p.input_value('#lembrete-titulo'), 'Rascunho')
        self.assertTrue(p.is_checked('#lembrete-ativo'))


class ReconexaoDoAparelho(UITest):
    """O Chrome às vezes troca a inscrição do aparelho, ou a função apaga uma que falhou.
    Se a pessoa pediu para receber e a permissão continua concedida, o app se reconecta sozinho ao abrir."""

    def ativar(self):
        self.login()
        self.go('config')
        self.page.click('#lembrete-ativar-aparelho')
        self.page.wait_for_selector('#lembrete-aparelho:has-text("Este aparelho recebe")')

    def reabrir(self):
        self.page.reload(); self.pronto()
        self.page.wait_for_function("(window.__memFuncoes || []).length >= 0")
        self.page.wait_for_timeout(300)

    def test_inscricao_apagada_do_banco_volta_sozinha(self):
        self.ativar()
        self.page.evaluate("window.__memdbApagar('push_inscricoes')")
        self.assertEqual(self.db('push_inscricoes'), [])
        self.reabrir()  # abre na tela Mês, sem tocar em nada
        insc = self.db('push_inscricoes')
        self.assertEqual([(i['owner_id'], i['endpoint']) for i in insc], [('u1', 'https://push.teste/aparelho-1')])

    def test_inscricao_perdida_no_celular_e_refeita_sem_perguntar(self):
        self.ativar()
        self.page.evaluate("sessionStorage.removeItem('mempush'); window.__memdbApagar('push_inscricoes')")
        self.reabrir()
        self.assertEqual(len(self.db('push_inscricoes')), 1)
        self.go('config')
        self.page.wait_for_selector('#lembrete-aparelho:has-text("Este aparelho recebe")')

    def test_guarda_o_endereco_para_o_service_worker(self):
        self.ativar()
        guardado = self.page.evaluate("""async () => {
            const r = await (await caches.open('financas-inscricao')).match('./__inscricao');
            return r ? (await r.json()).endpoint : null; }""")
        self.assertEqual(guardado, 'https://push.teste/aparelho-1')

    def test_quem_parou_de_receber_nao_e_reinscrito(self):
        self.ativar()
        self.page.click('#lembrete-desativar-aparelho')
        self.page.wait_for_selector('#lembrete-aparelho:has-text("ainda não recebe")')
        self.reabrir()
        self.assertEqual(self.db('push_inscricoes'), [])

    def test_sem_ter_ativado_neste_aparelho_nao_faz_nada(self):
        self.login()
        self.page.evaluate("sessionStorage.setItem('mempush-perm', 'granted')")
        self.reabrir()
        self.assertEqual(self.db('push_inscricoes'), [])
        self.assertEqual(self.page.evaluate('window.__memFuncoes || []'), [])
