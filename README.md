# Controle de Finanças Pessoais

App de finanças pessoais para duas pessoas, num único arquivo (`index.html`), com dados no Supabase.

- Lançamentos de gasto, receita e investimento, com tags, subtags e forma de pagamento
- Crédito conta no dia 10 do mês seguinte; parcelado distribui as parcelas pelos meses
- Recorrentes, orçamento por tag, metas de economia
- Dashboards (gasto por tag, mês a mês, comparativo entre anos, aportes) e visão do ano
- Filtro Eu / Ela / Juntos: cada um edita só o seu, mas vê os dados do outro
- Backup em JSON e exportação em CSV

## Como colocar no ar

### 1. Banco (Supabase) — uma vez só

1. No painel do Supabase, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**. Esperado: "Success. No rows returned".
3. Confira com `select tablename, rowsecurity from pg_tables where schemaname='public';`: 7 tabelas, todas `true`.
4. Em **Authentication → Users**, crie as contas (e-mail + senha, com **Auto Confirm User**).
5. Em **Authentication → Sign In / Providers**, mantenha **Allow new users to sign up** desligado.

### Atualizações do banco

Quando uma versão nova do app precisar mudar o banco, ela vem com um arquivo `supabase/migracao-NNN-*.sql`.
Rode esse arquivo no SQL Editor **antes** de usar a versão nova. Ele não apaga nenhum dado.

- `migracao-002-doacoes.sql` — adiciona o tipo "Doação".

### 2. Chave do app

A **publishable key** do projeto já vem no `index.html` (constante `SUPABASE_PUBLISHABLE_KEY`).
Ela é pública por natureza. Se um dia trocar de projeto no Supabase, atualize essa linha.
Nunca coloque a *secret key* nem a senha do banco no arquivo.

### 3. GitHub Pages

1. Crie um repositório **público** no GitHub (ex.: `controle-financas`).
2. Envie os arquivos deste projeto (no mínimo `index.html`).
3. Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)` e salve.
4. Em 1 a 2 minutos o app fica em `https://SEU-USUARIO.github.io/controle-financas/`.
5. No Supabase, em **Authentication → URL Configuration**, coloque esse endereço em **Site URL**.

O código fica público, mas os dados não: sem login ninguém lê nada (RLS + cadastro desligado).

### 4. Teste rápido

1. Abra o link no celular, entre com sua conta e lance um gasto de teste.
2. Abra no computador e recarregue: o gasto deve aparecer.
3. No Supabase, **Table Editor → transactions** deve mostrar a linha.

## Para desenvolvedores

- `npm test` roda:
  - testes das regras e da camada de armazenamento (Node);
  - testes do banco com RLS num Postgres local (`tests/db`, precisa de `psql` e de um servidor em `/var/tmp/pgtest:5499`);
  - testes de interface no Chrome headless (`tests/ui`, Python + Playwright).
- O `index.html` é dividido em 7 seções marcadas por comentários. Só a seção 3 (Armazenamento) fala com o banco.
