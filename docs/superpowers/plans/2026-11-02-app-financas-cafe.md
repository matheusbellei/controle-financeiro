# Controle de Finanças Pessoais — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** um app de finanças pessoais para duas pessoas, num único `index.html` com dados no Supabase, publicado no GitHub Pages.

**Arquitetura:** um arquivo HTML com 7 seções marcadas por comentários. Só a seção 3 (Armazenamento) fala com o Supabase. A seção 4 (Modelo e regras) contém funções puras, sem DOM e sem rede, testadas em Node: o teste extrai essa seção do `index.html` e a executa num `vm`. As telas (seção 5) só chamam as seções 3 e 4.

**Tecnologias:** HTML/CSS/JS puros; `@supabase/supabase-js@2` (jsDelivr); Chart.js 4 (cdnjs); ícones Tabler (webfont via CDN); Postgres + Auth + RLS no Supabase; `node --test` para as regras.

**Spec:** documento "App de Finanças Café — Design" (Claude Docs), aprovado em 02/11/2026.

## Restrições globais

- Um único arquivo de app: `index.html`. Seções delimitadas exatamente por `/* === N NOME === */` … `/* === FIM N === */`: 1 ESTILOS, 2 ESTRUTURA, 3 ARMAZENAMENTO, 4 MODELO E REGRAS, 5 TELAS, 6 GRAFICOS, 7 INICIALIZACAO.
- Valores sempre em centavos inteiros (`amount_cents`). Exibição com `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})`.
- Datas guardadas em ISO `YYYY-MM-DD` e exibidas em `dd/mm/aaaa`. O mês é o do calendário.
- Tipos de lançamento: `gasto`, `receita`, `investimento`. Pagamento: `pix`, `debito`, `credito`, `dinheiro`.
- Crédito: a competência é o dia 10 do mês seguinte à compra. A regra vale também para recorrentes no crédito.
- Saldo livre = receitas − gastos − investimentos. Investimento nunca entra nos gráficos por tag.
- Subtags somam na tag-mãe em orçamentos e dashboards.
- No código vão apenas `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`. Nunca a secret key nem a senha do banco.
- Paleta: Espresso #3B2416, Mocha #6F4E37, Caramelo #C68B59, Latte #E8D3B9, Creme #F5EBDD, Espuma #FBF6EF, Receita #5B7A3A, Alerta terracota #B5543A.
- Interface em português do Brasil, pensada primeiro para celular (largura mínima de 360px).

## Pontos de atenção na revisão

1. **Compra no crédito em dezembro:** a competência é 10/01 do ano seguinte. Uma parcela 12/12 iniciada em maio atravessa a virada do ano. Teste na Tarefa 2.
2. **Parcela com centavos que não dividem exato:** R$ 100,00 em 3x dá 3334 + 3333 + 3333, e a soma sempre fecha o total. Teste na Tarefa 2.
3. **Recorrente no dia 31 em mês curto:** cai no último dia do mês (28/02 ou 29/02). Teste na Tarefa 2.
4. **Abrir o mesmo mês duas vezes:** não pode duplicar os recorrentes. Isso é garantido por uma chave única no banco (Tarefa 1) e pelo teste de `pendingRecurrences` (Tarefa 2).
5. **Ver os dados da outra pessoa:** na tela e no banco, ela fica só leitura. Os botões de editar e excluir somem, e o RLS bloqueia qualquer gravação. Teste manual na Tarefa 5.

---

### Tarefa 1: Esquema do banco no Supabase

**Arquivos:**
- Criar: `supabase/schema.sql`

**Interfaces:**
- Produz as tabelas `profiles(id uuid pk = auth.users.id, name text)`, `tags(id uuid pk, name text, color text, icon text, parent_id uuid null → tags, archived bool default false, created_by uuid)`, `transactions(id uuid pk, owner_id uuid, kind text, amount_cents bigint, description text, purchase_date date, competence_date date, tag_id uuid null, payment text null, installment_group uuid null, installment_n int null, installment_total int null, recurrence_id uuid null, created_at timestamptz)`, `recurrences(id uuid pk, owner_id uuid, kind text, amount_cents bigint, description text, tag_id uuid, payment text, day_of_month int 1–31, start_month date, end_month date null, paused bool default false)`, `budgets(id uuid pk, owner_id uuid, tag_id uuid, monthly_cents bigint, unique(owner_id, tag_id))`, `goals(id uuid pk, owner_id uuid, name text, target_cents bigint, deadline date)` e `goal_deposits(id uuid pk, goal_id uuid, owner_id uuid, amount_cents bigint, date date)`.
- `check` em `kind` e `payment` com os valores das Restrições globais.
- `unique (recurrence_id, competence_date)` em `transactions`.
- Trigger `on auth.users insert` → cria a linha em `profiles` com o e-mail como nome.

- [ ] **Passo 1: escrever `schema.sql`** com as tabelas acima, `grant select, insert, update, delete … to authenticated` e RLS ativo em todas. Políticas: `select` para `authenticated` em tudo; `insert/update/delete` só onde `owner_id = auth.uid()`; em `tags`, `insert/update` para qualquer `authenticated` e `delete` proibido (tags são arquivadas, nunca excluídas). Nenhum `grant` para `anon`.
- [ ] **Passo 2: Matheus roda o script** no SQL Editor. Esperado: "Success. No rows returned".
- [ ] **Passo 3: verificar.** Rodar `select tablename, rowsecurity from pg_tables where schemaname='public';`. Esperado: 7 tabelas, todas com `rowsecurity = true`. Rodar `select * from profiles;`. Esperado: 1 linha (Matheus).
- [ ] **Passo 4: commit** `git add supabase/schema.sql && git commit -m "feat: esquema do banco com RLS"`

### Tarefa 2: Regras financeiras (seção 4) + testes

**Arquivos:**
- Criar: `index.html` (esqueleto com as 7 seções vazias e a seção 4 preenchida)
- Criar: `tests/load-rules.mjs`: lê o `index.html`, extrai o texto entre os marcadores da seção 4, executa num `vm.createContext({})` e exporta as funções globais.
- Criar: `tests/regras.test.mjs`

**Interfaces (produz, todas puras):**
- `competenceDate(purchaseISO: string, payment: string): string`
- `splitInstallments(totalCents: number, n: number, purchaseISO: string): {amount_cents:number, competence_date:string, installment_n:number, installment_total:number}[]`. A parcela k (de 1 a n) tem competência no dia 10 do mês da compra + k; o resto dos centavos vai na parcela 1.
- `recurrenceDateFor(rec, monthISO: string): string`, onde `monthISO = 'YYYY-MM-01'`. Retorna `min(day_of_month, último dia do mês)`. Se `payment === 'credito'`, aplica `competenceDate` sobre essa data.
- `pendingRecurrences(recs, existingTxs, monthISO): object[]`: retorna as transações a criar (ativas, dentro de início e fim, não pausadas e ainda sem transação com o mesmo `recurrence_id` e a mesma `competence_date`).
- `monthSummary(txs): {receitas, gastos, investido, livre}`, em centavos.
- `rootTagId(tagId, tags): string`
- `totalsByRootTag(txs, tags): Map<string, number>`. Considera só os gastos.
- `budgetStatus(spentCents, limitCents): 'ok'|'atencao'|'estourou'`, com atenção a partir de 80% (inclusive) e estourou acima de 100%.
- `monthlySeries(txs, year): {mes:1..12, receitas, gastos, investido}[]`
- `formatBRL(cents): string`, `formatDateBR(iso): string`

- [ ] **Passo 1: escrever os testes que falham:**
  - `competenceDate('2026-10-28','credito') === '2026-11-10'`; `('2026-12-31','credito') === '2027-01-10'`; `('2026-10-28','pix') === '2026-10-28'`
  - `splitInstallments(10000, 3, '2026-10-28')` → valores `[3334, 3333, 3333]`, competências `['2026-11-10','2026-12-10','2027-01-10']`, `installment_n` de 1 a 3
  - soma de `splitInstallments(99999, 7, …)` é igual a `99999`
  - `recurrenceDateFor({day_of_month:31, payment:'pix'}, '2026-02-01') === '2026-02-28'`; `(…, '2028-02-01') === '2028-02-29'`; `({day_of_month:5, payment:'credito'}, '2026-11-01') === '2026-12-10'`
  - `pendingRecurrences` chamada duas vezes com a saída da primeira já em `existingTxs` → a segunda retorna `[]`; uma recorrência pausada ou com `end_month` anterior ao mês → `[]`
  - `monthSummary` de [receita 600000, gasto 387000, investimento 80000] → `livre === 133000`
  - `totalsByRootTag`: gasto em subtag Mercado (mãe Alimentação) soma em Alimentação; investimento é ignorado
  - `budgetStatus(799, 1000)==='ok'`, `(800,1000)==='atencao'`, `(1001,1000)==='estourou'`
  - `formatBRL(4890) === 'R$ 48,90'` (comparar após trocar o espaço não separável por espaço comum)
- [ ] **Passo 2: rodar** `node --test tests/`. Esperado: FAIL ("is not defined").
- [ ] **Passo 3: implementar as funções** da seção 4. Datas calculadas em UTC (`Date.UTC`) para não deslocar o dia por fuso horário.
- [ ] **Passo 4: rodar** `node --test tests/`. Esperado: todos passam.
- [ ] **Passo 5: commit** `git commit -am "feat: regras financeiras com testes"`

### Tarefa 3: Armazenamento e login (seção 3)

**Interfaces:**
- Consome: as tabelas da Tarefa 1.
- Produz o objeto global `store`:
  - `store.signIn(email, senha): Promise<user>`, `store.signOut()`, `store.currentUser(): user|null`, `store.onAuthChange(cb)`
  - `store.list(tabela, filtros?): Promise<row[]>`, onde `filtros` aceita `{competence_from, competence_to, owner_id}`
  - `store.insert(tabela, row|row[])`, `store.update(tabela, id, campos)`, `store.remove(tabela, id)`, `store.removeWhere(tabela, {installment_group})`
  - Todo erro vira `throw new Error(mensagemEmPortugues)`.
- Constantes no topo da seção: `SUPABASE_URL = 'https://qtgkpnejimlrkjdhrqfh.supabase.co'` e `SUPABASE_PUBLISHABLE_KEY = '<colada pelo Matheus>'`.

- [ ] **Passo 1: implementar** com `supabase.createClient`. A sessão persiste no navegador (padrão do supabase-js).
- [ ] **Passo 2: verificação manual.** Abrir o `index.html` local, rodar no console `await store.signIn(...)` e depois `await store.list('profiles')`. Esperado: 1 linha. Com a sessão encerrada, `store.list('tags')` deve retornar `[]` ou erro, nunca dados.
- [ ] **Passo 3: commit.**

### Tarefa 4: Casca do app: estilos, login e menu (seções 1, 2 e 7)

**Interfaces:**
- Produz `router.go(nomeTela)`, com as telas `mes`, `dashboards`, `ano`, `metas`, `recorrentes`, `tags`, `config`.
- Produz `state = {user, viewingOwner: 'eu'|'ela'|'juntos', year, month, tags, people}`.

- [ ] **Passo 1:** paleta como variáveis CSS; tela de login (e-mail e senha, erro em português); cabeçalho com o ícone de três tracinhos que abre o menu com as 7 telas e "Sair".
- [ ] **Passo 2:** a inicialização verifica a sessão. Sem sessão → login. Com sessão → `router.go('mes')` no mês atual.
- [ ] **Passo 3: verificação manual.** Senha errada mostra "E-mail ou senha incorretos." Login certo abre o Mês. Recarregar a página mantém o login. "Sair" volta para a tela de login.
- [ ] **Passo 4: commit.**

### Tarefa 5: Tela do Mês + Novo lançamento

**Interfaces:**
- Consome: `store.*`, `competenceDate`, `splitInstallments`, `pendingRecurrences`, `monthSummary`, `totalsByRootTag`, `budgetStatus`.

- [ ] **Passo 1: tela Mês:** setas de mês e seletor de ano; filtro Eu / Ela / Juntos; 4 cartões (Entrou, Saiu, Investido, Livre); barras de orçamento por tag-mãe; lista do mês ordenada por competência, com ícone de recorrente e indicação de "parcela n/N"; busca por texto e filtros por tag e pagamento. Ao abrir um mês, os recorrentes pendentes do usuário logado são criados.
- [ ] **Passo 2: Novo lançamento:** abas Gasto / Receita / Investimento; campo de valor com máscara de R$; data (padrão: hoje); descrição; tag com as 5 mais usadas primeiro; pagamento (só para gasto); parcelas de 1 a 24 (só no crédito); aviso "Entra em dd/mm"; opção "estorno", que grava o gasto com valor negativo na mesma tag. Ao salvar no crédito com mais de 1 parcela, insere todas com o mesmo `installment_group`.
- [ ] **Passo 3: editar e excluir** só lançamentos próprios. Numa compra parcelada, perguntar se a ação vale para "só esta" ou "todas as parcelas". Mudar a data da compra recalcula todas as parcelas.
- [ ] **Passo 4: verificação manual.**
  - Gasto de R$ 300 em 3x no crédito em 28/10 aparece em nov, dez e jan, com R$ 100 em cada.
  - Saldo livre = entrou − saiu − investido.
  - Um lançamento da outra conta aparece no filtro "Ela" sem botões de editar e excluir.
  - Abrir o mês duas vezes não duplica os recorrentes.
- [ ] **Passo 5: commit.**

### Tarefa 6: Tags e orçamentos

- [ ] **Passo 1: tela Tags:** árvore com tags e subtags; criar e renomear; escolher cor entre 12 tons terrosos fixos; escolher ícone entre cerca de 30 ícones Tabler; definir a tag-mãe; arquivar e desarquivar. Uma tag arquivada some do formulário de lançamento, mas continua aparecendo no histórico.
- [ ] **Passo 2: orçamento:** em cada tag-mãe, o campo "limite mensal (meu)" grava em `budgets`. Na visão Juntos, os limites e os gastos são somados.
- [ ] **Passo 3: verificação manual.** Um gasto em Alimentação › Mercado move a barra de Alimentação, que muda de cor em 80% e ao passar de 100%.
- [ ] **Passo 4: commit.**

### Tarefa 7: Recorrentes e Metas

- [ ] **Passo 1: tela Recorrentes:** lista, criar, editar, pausar e encerrar (preenche `end_month`). Alterações valem do mês atual em diante e não mexem nos lançamentos já criados.
- [ ] **Passo 2: tela Metas:** criar uma meta (nome, valor-alvo, prazo); registrar "guardei R$ X" (`goal_deposits`); barra de progresso com o texto "R$ guardado de R$ alvo · até mês/ano".
- [ ] **Passo 3: verificação manual.** Uma recorrente no dia 5 no crédito aparece com competência no dia 10 do mês seguinte. Uma meta com 2 depósitos mostra a soma dos dois.
- [ ] **Passo 4: commit.**

### Tarefa 8: Dashboards e visão do Ano (seção 6)

**Interfaces:**
- Consome: `totalsByRootTag`, `monthlySeries`, `rootTagId`.

- [ ] **Passo 1: Dashboards** com filtro Eu / Ela / Juntos e seletor de período:
  - gasto por tag (mês ou ano), em barras horizontais ordenadas; clicar numa tag abre as subtags;
  - evolução mês a mês, em barras agrupadas (entrou, saiu, investido);
  - comparativo entre anos (mesmo mês ou ano inteiro), com uma série por ano;
  - aportes: total do ano em destaque e barras por mês.
  - As cores seguem a paleta e a cor de cada tag.
- [ ] **Passo 2: tela Ano:** grade com os 12 meses (entrou, saiu, livre); tocar num mês abre a tela Mês.
- [ ] **Passo 3: verificação manual.** Os totais de um mês no dashboard batem com os cartões da tela Mês. Investimento não aparece em "gasto por tag".
- [ ] **Passo 4: commit.**

### Tarefa 9: Configurações, exportar e importar

- [ ] **Passo 1: Configurações:** editar o nome de exibição (`profiles`); "Exportar backup (JSON)" baixa `financas-AAAA-MM-DD.json` com todas as tabelas visíveis; "Exportar CSV" baixa os lançamentos (data, competência, dono, tipo, valor, descrição, tag, pagamento).
- [ ] **Passo 2: Importar JSON:** reinsere apenas as linhas do próprio usuário cujo `id` ainda não existe e mostra "X lançamentos importados, Y já existiam".
- [ ] **Passo 3: verificação manual.** Exportar, excluir um lançamento de teste, importar: o lançamento volta e nada fica duplicado.
- [ ] **Passo 4: commit.**

### Tarefa 10: Publicar no GitHub Pages

- [ ] **Passo 1:** Matheus cria um repositório público, envia o `index.html` (e as pastas `supabase/` e `tests/`) e ativa Settings → Pages → Branch `main` / root.
- [ ] **Passo 2: verificação no celular.** Abrir o link, fazer login, lançar um gasto. Ele deve aparecer no computador depois de recarregar a página.
- [ ] **Passo 3:** no Supabase, em Authentication → URL Configuration, preencher a Site URL com o link do Pages.
