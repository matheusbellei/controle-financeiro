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

## Tags e orçamento
- **Só um nível de subtag.** Uma tag que tem subtags não pode virar subtag.
- **Limite mensal** fica no formulário da tag principal. Apagar o valor remove o limite.
- **No "Juntos",** os limites dos dois são somados.

## Telas
- **Recorrentes** mostra só os seus. Os lançamentos gerados aparecem para os dois na tela Mês.
- **Encerrar recorrente:** o último lançamento é no mês atual. Não há como reativar; é preciso criar outro.
- **Retirada de meta:** basta guardar um valor negativo.
- **Subtags nos Dashboards** abrem pelos botões abaixo do gráfico (melhor no celular).
- **Comparativo entre anos:** uma linha de gastos por mês para cada ano (últimos 5 anos).
- **CSV** usa ponto e vírgula e vírgula decimal (padrão do Excel em português).
- **Importar backup** traz de volta só o que falta: as tags e os seus registros.

## Técnica
- **Login e dados no Supabase,** com RLS:
  - os dois veem tudo;
  - cada um grava só o que é seu;
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
- O CSV não protege contra fórmulas (descrições que começam com =, +, - ou @).
