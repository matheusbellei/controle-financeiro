# Decisões tomadas durante a construção

Decisões que o Claude tomou por conta própria. Cada item traz o que acontece se a decisão estiver errada.

## Regras de dinheiro
- **Recorrente no crédito:** ao abrir o mês M, é lançada a compra do mês anterior, que conta no dia 10 de M. *Se errado:* o primeiro mês de um recorrente no crédito só aparece no mês seguinte ao início.
- **Recorrentes só até o mês atual:** abrir um mês futuro não gera recorrentes. Isso evita inflar os totais do ano. *Se errado:* para ver o salário de dezembro, é preciso esperar dezembro (no crédito, um mês antes).
- **Recorrente já lançado no mês não é criado de novo**, mesmo que o dia tenha sido editado.
- **Excluir um lançamento de recorrente** oferece "Pular este mês": o valor vai a zero e a descrição ganha "(pulado)". *Se errado:* fica uma linha de R$ 0,00 na lista.
- **Estorno** é um gasto negativo na mesma tag, sempre em 1x (não pode ser parcelado).
- **Editar parcela:**
  - "Só esta" muda valor, descrição e tag, mas não a data.
  - "Todas" recalcula as datas de todas as parcelas e só troca o valor se ele mudou.
  - *Se errado:* não dá para mudar a data de uma única parcela.
- **Gasto sem tag** aparece como "Sem tag" nos gráficos.
- **Valores digitados:** "48,90" e "48.90" valem R$ 48,90. "1.234" vale R$ 1.234,00.

## Ajustes de 03/11
- **Doação** é um tipo próprio: tem forma de pagamento (crédito vai para o dia 10), não entra no gasto por tag nem no orçamento, e sai do saldo livre.
- **Nomes** aparecem só pelo primeiro nome, tirado do nome cadastrado ou do e-mail.
- **Subtags** ganharam uma tela própria no menu; o formulário de tag não fala mais de subtag.
- **Eixos dos gráficos** vão de R$ 300 em R$ 300 (até R$ 1.800). Acima disso, o passo cresce (R$ 600, R$ 1.500, R$ 3.000, R$ 6.000…), com no máximo 6 linhas.
- **Comparativo entre anos** tem os anos no eixo: o mês escolhido em cada ano, ou o ano inteiro.
- **Gasto por tag** mostra todas as tags ativas, mesmo com R$ 0.
- **Visão da outra pessoa é só consulta:** sem "Novo lançamento" e sem "Nova meta" (vale para os dois logins). No "Juntos", o que você cria fica no seu nome.
- **Chave pública** já vem no `index.html`.

## Ajustes de 03/11 (2)
- **Data da fatura:** no crédito, o campo "Cai na fatura do cartão em" já vem com o dia 10 do mês seguinte e acompanha a data da compra até você mudar. Parcelado: a 1ª parcela cai na data escolhida e as outras no mesmo dia dos meses seguintes. A fatura não pode ser antes da compra. Recorrentes no crédito continuam no dia 10.
- **Cores e ícones:** 58 cores, mais "Outra cor" livre, e 217 ícones em 10 grupos, iguais para tags e subtags.
- **Dashboards:** o filtro de período do topo saiu. Cada gráfico tem os próprios filtros (período, mês, ano, medida, anos comparados, formato), que ficam salvos neste navegador e não mudam a tela Mês. O filtro Eu / Denise / Juntos continua no topo, valendo para todos.

## Ajustes de 05/11
- **Cada um vê só o seu:** saiu o filtro Eu / Denise / Juntos de todas as telas. Mês, Ano, Dashboards, Metas, Recorrentes, backup e CSV mostram só os dados de quem está logado. Tags e subtags continuam compartilhadas. No banco, a leitura entre os dois ainda é permitida (só a tela esconde).
- **Tag em dois passos:** no lançamento e no recorrente, escolhe-se a tag e depois a subtag (opcional). Saiu a lista "Mais usadas".
- **Filtro da lista do Mês:** só tags; ao escolher uma, aparece o filtro de subtag. Filtrar pela tag inclui as subtags dela.
- **Orçamento de tag de receita:** quando no mês a tag só tem receitas, a barra vira verde e mostra "Entrou X de Y" (meta de receita).
- **Receitas e investimentos** mostram a tag na lista.
- **Celular:** a página não passa mais da largura da tela (os seletores com nomes compridos alargavam tudo).

## Ajustes de 08/11
- **Tags e subtags em blocos:** cada tag é um cartão com limite e subtags; na tela Subtags, cada tag tem o próprio botão "+ Subtag". Arquivadas vão para o fim, apagadas.
- **Excluir tag/subtag:** além de arquivar. Lançamentos e recorrentes com ela ficam "Sem tag" (dos dois, pois a tag é compartilhada); subtags dela e limites dela são apagados. Pede confirmação mostrando o que será afetado.
- **Aba Orçamento:** renda base = o que já entrou no mês. Compara a soma dos limites das tags de gasto com essa renda ("cabe" / "passa R$ X"). Limites são editados ali (saíram do formulário de tag). Tags usadas só com receitas nos últimos 12 meses ficam em "Metas de receita" e não entram na soma. A tela Mês mantém o cartão resumido com o botão "Planejar".
- **Gasto extraordinário:** marcação no lançamento de gasto. Conta no que saiu e na sobra real, mas fica fora da barra da tag; aparece como "+ R$ X extraordinário". Em compra parcelada, vale para todas as parcelas.
- **Vírgula automática:** nos campos de dinheiro, os dígitos entram pela direita (4890 → 48,90). Valor colado é lido como está escrito (1.500 → 1.500,00).

## Ajustes de 08/11 (2)
- **Aba Subtags removida:** cada bloco da aba Tags lista as subtags dela, com editar, arquivar e excluir, e um botão "+ Subtag" que já abre com a tag escolhida. Editar uma subtag permite trocá-la de tag.

## Ajustes de 08/11 (3)
- **Valor de cada parcela:** no crédito com mais de uma parcela, aparece a lista das parcelas com a data da fatura de cada uma e o valor, já dividido igual. Mudar uma parcela atualiza o total; mudar o total volta a dividir igual. Parcela vazia impede salvar.

## Ajustes de 12/11
- **Orçamento por tag soma todo dinheiro que saiu:** gasto, investimento e doação lançados numa tag contam na barra dela (tela Mês e aba Orçamento). Os totais do topo (Entrou, Saiu, Investido, Doações, Livre) e o "Gasto até agora" continuam separados.

## Ajustes de 12/11 (2)
- **Filtros da lista do Mês:** resumo do que está filtrado (quantos lançamentos, quanto saiu e quanto entrou); ordenar por data da compra (recentes ou antigos) ou por valor (maior ou menor); em "Mais filtros", data da compra de/até e valor mínimo/máximo; botão "Limpar". O filtro de data usa a data da compra, não o dia em que conta na fatura.

## Ajustes de 12/11 (3)
- **Livre planejado × Saldo atual:** o antigo "Livre" virou "Livre planejado" (mês inteiro, inclusive o que ainda vai cair). Novo cartão "Saldo atual" (só no mês corrente): entrou − saiu − investido − doado de tudo que já aconteceu até hoje, somando conta e dinheiro vivo; no crédito vale o dia da fatura. Como o saldo do mês anterior é lançado como receita, ele fica igual ao saldo real.

## Ajustes de 12/11 (4)
- **Tag de investimento fica verde ao passar do limite:** vale para a tag-mãe que só tem lançamentos do tipo Investimento (no mês, na tela Mês; nos últimos 12 meses, na aba Orçamento). Ela não fica laranja aos 80%; ao chegar ou passar do limite, a barra e o texto ficam verdes.

## Ajustes de 13/11
- **Extraordinário parcial:** ao marcar "Gasto extraordinário", aparece "Quanto disso é extraordinário" (vem com o total). Só essa parte fica fora do orçamento; o resto conta na barra da tag. No parcelado, a parte é dividida entre as parcelas na proporção de cada uma. Precisa da migracao-004. Sem ela, marcar o lançamento inteiro continua funcionando.

## Ajustes de 20/11
- **Criar tag ou subtag dentro do lançamento:** no seletor de Tag há "+ Nova tag…" e no de Subtag, "+ Nova subtag…" (o campo de subtag aparece para qualquer tag escolhida). Abre um painel no próprio formulário, com nome, as mesmas cores, "Outra cor" e ícones da aba Tags; ao criar, volta ao lançamento com tudo preservado e a tag nova selecionada. Vale também no formulário de recorrente. Esc e "Voltar" só fecham o painel. Editar, arquivar e excluir continuam na aba Tags.

## Ajustes de 20/11 (2)
- **App instalável (PWA):** nome "Controle de Finanças Pessoais", curto "Finanças pessoais", ícone de moeda caramelo com "R$" no fundo café. O service worker busca a página sempre da internet primeiro (para pegar versões novas) e guarda uma cópia para abrir sem conexão; ícones, fontes e bibliotecas vêm da cópia guardada; dados do Supabase nunca passam pelo cache.

## Ajustes de 20/11 (3)
- **Privacidade no banco (migracao-005):** o banco só entrega a cada conta os próprios lançamentos, recorrentes, limites, metas, valores guardados e perfil. Antes só a tela escondia.
- **Tags por pessoa:** as tags de hoje ficam com o dono indicado pelo e-mail no script; cada outra conta recebe uma cópia (mesmo nome, cor, ícone, arquivamento e subtags), e os lançamentos, recorrentes e limites dela passam a apontar para a cópia. Daí em diante, criar, editar, arquivar ou excluir uma tag só afeta quem é dono dela. *Se errado:* uma tag nova criada por um não aparece para o outro; é preciso criar nas duas contas.
- **Subtag em tag de outra pessoa:** o banco não impede tecnicamente (a checagem causava recursão nas regras), mas a tela só mostra as suas tags, então isso não acontece pelo app.
- **Backup:** importar traz as suas tags; backup antigo, sem dono nas tags, também é aceito.

## Ajustes de 20/11 (4)
- **Ocultar valores:** botão de olho no topo, em todas as telas. Desfoca valores, totais, saldos, lançamentos, resumos e gráficos (o layout não muda). Continuam visíveis os limites de orçamento ("de R$ 800"), a soma dos limites, o "Meu limite" das tags e o alvo das metas. Fica lembrado neste aparelho. Formulários abertos mostram os números normalmente. *Se errado:* a barra do orçamento ainda mostra a proporção gasta, e com o limite visível dá para estimar o gasto.

## Ajustes de 20/11 (5)
- **"Saiu" soma tudo que saiu:** na tela Mês e na aba Ano, o cartão Saiu = gastos + investido + doações e vem depois de Investido e Doações, para a conta fechar (Entrou − Saiu = Livre). Abaixo dele aparece "só gastos R$ X". Nos cartões de cada mês da aba Ano, o "Saiu" também soma tudo (saiu a linha "Doado"). A aba Orçamento ("Gasto até agora") e os Dashboards continuam contando só gastos.

## Ajustes de 22/11
- **Lembrete diário por notificação (migracao-006 + Edge Function `lembrete-diario`):** o banco chama a função a cada 15 minutos; ela pergunta ao banco quem deve ser avisado e envia. Cada pessoa tem a própria configuração, em Configurações → Lembrete diário. Tudo salva sozinho.
- **Janela de envio:** do horário escolhido até 1 hora depois, uma vez por dia. *Se errado:* se o agendamento ficar parado por mais de 1 hora, o lembrete daquele dia não sai. Ligar o lembrete depois do horário também só avisa no dia seguinte.
- **"Cancelar a notificação se já houver um lançamento no dia"** (vem ligado): conta o lançamento **criado** hoje, não a data da compra. Lançar hoje uma compra de ontem também conta.
- **Frases:** 33 prontas: Buffett, Munger, Graham, Franklin, Bogle, Lynch, Housel, Sêneca, Kiyosaki, Samuelson e Rohn, só com autoria conhecida, mais 5 de personagens sobre dinheiro (Tio Patinhas, Seu Madruga, Tyler Durden, Sr. Siriguejo, Jordan Belfort; migracao-007). Saíram a do Dave Ramsey e a do Buffett sobre a maré. As traduções são livres. Cada um liga/desliga autores, escolhe a origem (prontas e minhas, só prontas, só minhas) e cria as próprias, que o outro não vê. A frase é sorteada e não repete a do dia anterior. Uma frase pronta não pode ser editada pelo app.
- **Aparelhos:** cada aparelho ativado recebe o lembrete; ativar também liga o lembrete. Se o mesmo aparelho for usado pelas duas contas, fica com quem ativou por último. Aparelho que desinstalou o app é removido no primeiro envio que falhar. *Se errado:* sair da conta não desativa o aparelho; é preciso tocar em "Parar de receber neste aparelho".
- **Sem bibliotecas na função:** criptografia (RFC 8291) e assinatura (RFC 8292) com WebCrypto, testadas com o exemplo do RFC. A função confere sozinha o segredo do agendamento e o login de quem pede o teste, por isso a verificação de JWT do Supabase fica desligada.
- **iPhone:** só funciona com o app instalado na Tela de Início (iOS 16.4+); a tela avisa quando não está.
- **Reconexão automática do aparelho:** ao abrir o app (e a tela de Configurações), se você tocou em "Receber neste aparelho" e a permissão continua concedida, o app refaz e registra a inscrição sozinho, sem perguntar. Isso cobre o Chrome trocando o endereço de notificação e a função apagando uma inscrição que falhou. Quem tocou em "Parar de receber" não é reinscrito. A escolha fica guardada no aparelho. *Se errado:* se a inscrição cair, só volta quando o app for aberto.
- **Troca em segundo plano:** quando o Chrome renova a inscrição do aparelho (evento `pushsubscriptionchange`, Chrome 138+), o service worker cria a nova e pede à função para trocar o endereço antigo pelo novo, sem login e sem abrir o app. O endereço antigo é a prova; o app o guarda num cofre do navegador para quando o Chrome não o informa. *Se errado:* se o Android ou o Chrome tirar a permissão de notificação, nada volta sozinho; é preciso reativar.
- **Ícone da notificação:** sem imagem extra (no Android o logo aparecia duas vezes; o iPhone mostra sempre só o ícone do app). Na barra de status do Android vai um "R$" branco em fundo transparente (`icone-notificacao.png`).
- **Correção (22/11):** a tela do lembrete dizia "rode a migração 006" mesmo com ela rodada. A busca da configuração ordenava por uma coluna `id` que essa tabela não tem.

## Ajustes de 25/11
- **Lembrete com botão Salvar:** as mudanças ficam só na tela (a prévia acompanha) até tocar em **Salvar**. Aparece "Alterações não salvas" enquanto houver diferença. As opções de frase (incluir, origem, autores) foram para dentro do card do lembrete, para um Salvar só. "Minhas frases" continua gravando na hora (adicionar, editar, excluir). "Enviar teste" pede para salvar antes, se houver mudança. Tocar em "Receber neste aparelho" liga o lembrete no banco sem gravar o resto do rascunho.
- **Tema escuro:** Configurações → Aparência: Automático (segue o celular ou o computador), Claro ou Escuro, guardado no aparelho. Aplicado antes de a página aparecer (não pisca no claro). Cores de café escuro; o botão principal fica creme com texto escuro. Os gráficos leem as cores do tema ao desenhar; se o celular trocar de tema com o app aberto, a tela é redesenhada. A barra de status do celular acompanha.

## Tags e orçamento
- **Só um nível de subtag.** Uma tag que tem subtags não pode virar subtag.
- **Limite mensal** fica no formulário da tag principal. Apagar o valor remove o limite.
- **No "Juntos",** os limites dos dois são somados.

## Telas
- **Recorrentes** mostra só os seus.
- **Encerrar recorrente:** o último lançamento é no mês atual. Não há como reativar; é preciso criar outro.
- **Retirada de meta:** basta guardar um valor negativo.
- **Subtags nos Dashboards** abrem pelos botões abaixo do gráfico (melhor no celular).
- **Comparativo entre anos:** uma linha de gastos por mês para cada ano (últimos 5 anos).
- **CSV** usa ponto e vírgula e vírgula decimal (padrão do Excel em português).
- **Importar backup** traz de volta só o que falta: as tags e os seus registros.

## Técnica
- **Login e dados no Supabase,** com RLS:
  - cada um vê e grava só o que é seu, inclusive as tags;
  - lançamentos só apontam para recorrentes seus;
  - valores guardados só vão para metas suas.
- **Buscas** são feitas em páginas de 1000 linhas, para anos de histórico não serem cortados.
- **Testes:**
  - regras de dinheiro em Node;
  - banco com RLS num Postgres local;
  - interface no Chrome com um banco em memória que imita o RLS.
  - *Se errado:* uma diferença em relação ao Supabase real só aparece no seu teste de uso.

## Pendências pequenas (não corrigidas)
- A cor da tag aceita texto livre. Vale travar no banco para aceitar só o formato #RRGGBB.
- Arquivar uma tag-mãe esconde as subtags ativas do seletor.
- A importação do backup para no meio se um recorrente do mês já foi recriado com outro id.
- O texto de "Encerrar" indica o mês errado para recorrente no crédito.
- Mudar mês ou ano nos Dashboards também muda o mês da tela Mês.
- Importar na conta da Denise um backup antigo feito pela conta do Matheus falha nas tags (o id já existe, mas é dele).
- O CSV não protege contra fórmulas (descrições que começam com =, +, - ou @).
