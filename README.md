# Controle de Finanças Pessoais

App de finanças pessoais para duas pessoas, num único arquivo (`index.html`), com dados no Supabase.

- Lançamentos de gasto, receita e investimento, com tags, subtags e forma de pagamento
- Crédito conta no dia 10 do mês seguinte; parcelado distribui as parcelas pelos meses
- Recorrentes, orçamento por tag, metas de economia
- Dashboards (gasto por tag, mês a mês, comparativo entre anos, aportes) e visão do ano
- Cada conta vê e edita só os próprios dados, com as próprias tags (garantido no banco)
- Lembrete diário por notificação, com frases sobre dinheiro (configurável por pessoa)
- Backup em JSON e exportação em CSV

## Como colocar no ar

### 1. Banco (Supabase) — uma vez só

1. No painel do Supabase, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**. Esperado: "Success. No rows returned".
3. Confira com `select tablename, rowsecurity from pg_tables where schemaname='public';`: 10 tabelas, todas `true`.
4. Em **Authentication → Users**, crie as contas (e-mail + senha, com **Auto Confirm User**).
5. Em **Authentication → Sign In / Providers**, mantenha **Allow new users to sign up** desligado.

### Atualizações do banco

Quando uma versão nova do app precisar mudar o banco, ela vem com um arquivo `supabase/migracao-NNN-*.sql`.
Rode esse arquivo no SQL Editor **antes** de usar a versão nova. Ele não apaga nenhum dado.

- `migracao-002-doacoes.sql` — adiciona o tipo "Doação".
- `migracao-003-extraordinario-excluir-tags.sql` — gasto extraordinário e exclusão de tags/subtags.
- `migracao-004-extraordinario-parcial.sql` — só parte de um lançamento extraordinária.
- `migracao-005-privacidade.sql` — cada conta só lê os próprios dados, e as tags passam a ser de cada um.
  **Antes de rodar**, troque `COLOQUE-SEU-EMAIL-AQUI` (linha marcada com `<<<`) pelo e-mail de login de quem fica com as tags atuais.
  As outras contas recebem uma cópia delas. E-mail errado: o script para e nada muda.
- `migracao-006-lembrete-diario.sql` — lembrete diário: configuração por pessoa, aparelhos e frases prontas.
- `migracao-007-frases-de-personagens.sql` — troca 2 frases prontas por 5 de personagens (Tio Patinhas, Seu Madruga…).

### Lembrete diário (notificações)

Além da migração 006, o lembrete precisa de uma Edge Function e de um agendamento no Supabase:

1. Gere as chaves em `ferramentas/gerar-chaves.html` (abre no navegador; nada sai dele).
2. Crie a Edge Function `lembrete-diario` com o código de `supabase/functions/lembrete-diario/index.ts`, com a verificação de JWT **desligada**.
3. Em Edge Functions → Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `LEMBRETE_SEGREDO` e `VAPID_SUBJECT` (`mailto:seu-email`).
4. Rode `supabase/agendar-lembrete.sql` no SQL Editor, trocando `COLE-O-SEGREDO-AQUI` pelo `LEMBRETE_SEGREDO` só no editor (nunca no arquivo).
5. No app: Configurações → Lembrete diário → Receber neste aparelho → Enviar teste agora.

A função não usa bibliotecas: a criptografia do Web Push (RFC 8291) e a assinatura VAPID (RFC 8292) são feitas com o WebCrypto e testadas com o exemplo oficial do RFC.

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

O código fica público, mas os dados não: sem login ninguém lê nada, e cada conta só lê o que é seu (RLS + cadastro desligado).

### Instalar no celular ou no PC (app instalável)

O app é instalável (PWA): ganha ícone e abre em janela própria. Os arquivos `manifest.json`, `sw.js` e `icone-*.png` precisam estar na mesma pasta do `index.html`.

- **Android (Chrome):** abra o site → menu ⋮ → **Instalar app** (ou aceite o aviso que aparece).
- **PC (Chrome ou Edge):** clique no ícone de instalar na barra de endereço → **Instalar**.
- **iPhone (Safari):** Compartilhar → **Adicionar à Tela de Início**.

Os dados continuam no Supabase, então é preciso internet para ver e salvar lançamentos. Ao publicar uma versão nova, o app instalado se atualiza na próxima vez que abrir (às vezes é preciso fechar e abrir de novo). Para refazer os ícones: `python3 ferramentas/gerar-icones.py`.

### 4. Teste rápido

1. Abra o link no celular, entre com sua conta e lance um gasto de teste.
2. Abra no computador e recarregue: o gasto deve aparecer.
3. No Supabase, **Table Editor → transactions** deve mostrar a linha.

## Para desenvolvedores

- `npm test` roda:
  - testes das regras e da camada de armazenamento (Node);
  - testes do banco com RLS num Postgres local (`tests/db`, precisa de `psql` e de um servidor em `/var/tmp/pgtest:5499`);
  - testes de interface no Chrome headless (`tests/ui`, Python + Playwright);
  - testes da função de lembrete (`tests/webpush.test.mjs`), com o Supabase e os serviços de push simulados.
- O `index.html` é dividido em 7 seções marcadas por comentários. Só a seção 3 (Armazenamento) fala com o banco.
