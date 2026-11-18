-- Atualização 003 — gasto "extraordinário" e exclusão de tags e subtags.
-- (gasto planejado fora do orçamento, como uma cirurgia ou viagem).
-- Rode uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- Não apaga nem altera nenhum lançamento: todos começam como "não extraordinário".

alter table public.transactions
  add column if not exists extraordinario boolean not null default false;

-- Permite EXCLUIR tags e subtags (antes só era possível arquivar).
-- Ao excluir: os lançamentos e recorrentes com ela ficam "Sem tag";
-- as subtags dela e os limites de orçamento dela são apagados.
alter table public.transactions drop constraint if exists transactions_tag_id_fkey;
alter table public.transactions add constraint transactions_tag_id_fkey
  foreign key (tag_id) references public.tags(id) on delete set null;
alter table public.recurrences drop constraint if exists recurrences_tag_id_fkey;
alter table public.recurrences add constraint recurrences_tag_id_fkey
  foreign key (tag_id) references public.tags(id) on delete set null;
alter table public.budgets drop constraint if exists budgets_tag_id_fkey;
alter table public.budgets add constraint budgets_tag_id_fkey
  foreign key (tag_id) references public.tags(id) on delete cascade;
alter table public.tags drop constraint if exists tags_parent_id_fkey;
alter table public.tags add constraint tags_parent_id_fkey
  foreign key (parent_id) references public.tags(id) on delete cascade;

grant delete on public.tags to authenticated;
drop policy if exists "excluir tags" on public.tags;
create policy "excluir tags" on public.tags for delete to authenticated using (true);
