-- Atualização 002 — adiciona o tipo "Doação".
-- Rode uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- Não apaga nem altera nenhum lançamento.

alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check
  check (kind in ('gasto','receita','investimento','doacao'));

alter table public.recurrences drop constraint if exists recurrences_kind_check;
alter table public.recurrences add constraint recurrences_kind_check
  check (kind in ('gasto','receita','investimento','doacao'));
