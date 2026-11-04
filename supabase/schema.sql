-- Controle de Finanças Pessoais — esquema do banco (Supabase / Postgres)
-- Rode este arquivo inteiro uma vez no SQL Editor do Supabase.
-- Valores em centavos inteiros. Datas em 'YYYY-MM-DD'.

-- ============ Tabelas ============

create table public.profiles (
  id   uuid primary key references auth.users(id) on delete cascade,
  name text not null
);

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default '#6F4E37',
  icon       text not null default 'tag',
  parent_id  uuid references public.tags(id),
  archived   boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id)
);

create table public.recurrences (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id),
  kind          text not null check (kind in ('gasto','receita','investimento','doacao')),
  amount_cents  bigint not null,
  description   text not null default '',
  tag_id        uuid references public.tags(id),
  payment       text check (payment in ('pix','debito','credito','dinheiro')),
  day_of_month  int not null check (day_of_month between 1 and 31),
  start_month   date not null,
  end_month     date,
  paused        boolean not null default false
);

create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users(id),
  kind              text not null check (kind in ('gasto','receita','investimento','doacao')),
  amount_cents      bigint not null,
  description       text not null default '',
  purchase_date     date not null,
  competence_date   date not null,
  tag_id            uuid references public.tags(id),
  payment           text check (payment in ('pix','debito','credito','dinheiro')),
  installment_group uuid,
  installment_n     int,
  installment_total int,
  recurrence_id     uuid references public.recurrences(id) on delete set null,
  created_at        timestamptz not null default now(),
  -- 1º dia do mês de competência; impede o mesmo recorrente duas vezes no mesmo mês.
  competence_month  date generated always as (competence_date - (extract(day from competence_date)::int - 1)) stored,
  unique (recurrence_id, competence_month)
);
create index transactions_competence_idx on public.transactions (competence_date);
create index transactions_group_idx on public.transactions (installment_group);

create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id),
  tag_id        uuid not null references public.tags(id),
  monthly_cents bigint not null check (monthly_cents >= 0),
  unique (owner_id, tag_id)
);

create table public.goals (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id),
  name         text not null,
  target_cents bigint not null check (target_cents > 0),
  deadline     date
);

create table public.goal_deposits (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goals(id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users(id),
  amount_cents bigint not null,
  date         date not null default current_date
);

-- ============ Perfil automático para cada usuário criado ============

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.email, 'Usuário'));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ Permissões (só usuários logados; visitante não acessa nada) ============

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.tags to authenticated;
grant select, insert, update, delete on
  public.transactions, public.recurrences, public.budgets, public.goals, public.goal_deposits
  to authenticated;

-- ============ Segurança por linha (RLS) ============

alter table public.profiles      enable row level security;
alter table public.tags          enable row level security;
alter table public.transactions  enable row level security;
alter table public.recurrences   enable row level security;
alter table public.budgets       enable row level security;
alter table public.goals         enable row level security;
alter table public.goal_deposits enable row level security;

-- Perfis: todos os logados veem; cada um edita o próprio.
create policy "ver perfis" on public.profiles for select to authenticated using (true);
create policy "editar meu perfil" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Tags: lista compartilhada — os dois veem, criam e editam. Não se excluem (arquivam).
create policy "ver tags" on public.tags for select to authenticated using (true);
create policy "criar tags" on public.tags for insert to authenticated with check (true);
create policy "editar tags" on public.tags for update to authenticated using (true) with check (true);

-- Dados pessoais: todos os logados veem; só o dono grava, edita e exclui.
-- Lançamentos só podem apontar para recorrentes próprios; valores guardados, só para metas próprias.
do $$
declare
  t text;
  extra text;
begin
  foreach t in array array['transactions','recurrences','budgets','goals','goal_deposits'] loop
    extra := case t
      when 'transactions' then ' and (recurrence_id is null or exists (select 1 from public.recurrences r where r.id = recurrence_id and r.owner_id = (select auth.uid())))'
      when 'goal_deposits' then ' and exists (select 1 from public.goals g where g.id = goal_id and g.owner_id = (select auth.uid()))'
      else '' end;
    execute format('create policy "ver" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "criar o meu" on public.%I for insert to authenticated with check (owner_id = (select auth.uid())%s)', t, extra);
    execute format('create policy "editar o meu" on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid())%s)', t, extra);
    execute format('create policy "excluir o meu" on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Usuários que já existiam antes deste script também ganham perfil.
insert into public.profiles (id, name)
select id, coalesce(email, 'Usuário') from auth.users
on conflict (id) do nothing;
