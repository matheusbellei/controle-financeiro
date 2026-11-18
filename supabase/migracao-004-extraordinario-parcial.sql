-- Atualização 004 — permite que só PARTE de um lançamento seja extraordinária.
-- Rode uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- Não altera nenhum lançamento: os extraordinários atuais continuam valendo pelo valor inteiro.

alter table public.transactions
  add column if not exists extraordinario_cents bigint check (extraordinario_cents >= 0);
