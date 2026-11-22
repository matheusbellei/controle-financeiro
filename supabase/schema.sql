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
  parent_id  uuid references public.tags(id) on delete cascade,
  archived   boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade
);
create index tags_owner_idx on public.tags (owner_id);

create table public.recurrences (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id),
  kind          text not null check (kind in ('gasto','receita','investimento','doacao')),
  amount_cents  bigint not null,
  description   text not null default '',
  tag_id        uuid references public.tags(id) on delete set null,
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
  tag_id            uuid references public.tags(id) on delete set null,
  payment           text check (payment in ('pix','debito','credito','dinheiro')),
  installment_group uuid,
  installment_n     int,
  installment_total int,
  recurrence_id     uuid references public.recurrences(id) on delete set null,
  extraordinario    boolean not null default false,
  extraordinario_cents bigint check (extraordinario_cents >= 0), -- parte extraordinária (vazio = o valor inteiro)
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
  tag_id        uuid not null references public.tags(id) on delete cascade,
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
grant select, insert, update, delete on public.tags to authenticated;
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

-- Perfis: cada um vê e edita só o próprio.
create policy "ver meu perfil" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "editar meu perfil" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Tags: cada um vê, cria, edita e exclui só as próprias.
create policy "ver minhas tags" on public.tags for select to authenticated using (owner_id = (select auth.uid()));
create policy "criar minhas tags" on public.tags for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "editar minhas tags" on public.tags for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "excluir minhas tags" on public.tags for delete to authenticated using (owner_id = (select auth.uid()));

-- Dados pessoais: cada conta só vê, grava, edita e exclui o que é seu.
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
    execute format('create policy "ver o meu" on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t);
    execute format('create policy "criar o meu" on public.%I for insert to authenticated with check (owner_id = (select auth.uid())%s)', t, extra);
    execute format('create policy "editar o meu" on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid())%s)', t, extra);
    execute format('create policy "excluir o meu" on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Usuários que já existiam antes deste script também ganham perfil.
insert into public.profiles (id, name)
select id, coalesce(email, 'Usuário') from auth.users
on conflict (id) do nothing;

-- ================================================================
-- Lembrete diário por notificação (igual à migracao-006)
-- ================================================================
-- ============ Tabelas ============

create table if not exists public.lembrete_config (
  owner_id           uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  ativo              boolean not null default false,
  hora               time not null default '21:00',
  dias               int[] not null default '{1,2,3,4,5,6,7}',   -- 1 = segunda … 7 = domingo
  pular_se_lancou    boolean not null default true,              -- não avisa se já lançou algo no dia
  titulo             text not null default 'Hora de lançar os gastos' check (char_length(titulo) between 1 and 60),
  mensagem           text not null default 'Leva um minuto: registre o que entrou e o que saiu hoje.' check (char_length(mensagem) <= 200),
  com_frase          boolean not null default true,
  fonte_frases       text not null default 'todas' check (fonte_frases in ('todas', 'prontas', 'minhas')),
  autores_desligados text[] not null default '{}',
  fuso               text not null default 'America/Sao_Paulo',
  ultimo_envio       date,
  ultima_frase       uuid
);

create table if not exists public.push_inscricoes (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  aparelho  text not null default '',
  criado_em timestamptz not null default now()
);
create index if not exists push_inscricoes_owner_idx on public.push_inscricoes (owner_id);

-- owner_id vazio = frase pronta, igual para todos.
create table if not exists public.frases (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid default auth.uid() references auth.users(id) on delete cascade,
  texto     text not null check (char_length(texto) between 1 and 280),
  autor     text not null default '' check (char_length(autor) <= 60),
  criado_em timestamptz not null default now()
);
create index if not exists frases_owner_idx on public.frases (owner_id);

-- ============ Permissões e RLS ============

grant select, insert, update, delete on public.lembrete_config to authenticated;
grant select, delete on public.push_inscricoes to authenticated;      -- gravar só pela função registrar_inscricao
grant select, insert, update, delete on public.frases to authenticated;
grant all on public.lembrete_config, public.push_inscricoes, public.frases to service_role;

alter table public.lembrete_config enable row level security;
alter table public.push_inscricoes enable row level security;
alter table public.frases          enable row level security;

drop policy if exists "meu lembrete" on public.lembrete_config;
create policy "meu lembrete" on public.lembrete_config for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "ver meus aparelhos" on public.push_inscricoes;
drop policy if exists "remover meus aparelhos" on public.push_inscricoes;
create policy "ver meus aparelhos" on public.push_inscricoes for select to authenticated using (owner_id = (select auth.uid()));
create policy "remover meus aparelhos" on public.push_inscricoes for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "ver frases" on public.frases;
drop policy if exists "criar minhas frases" on public.frases;
drop policy if exists "editar minhas frases" on public.frases;
drop policy if exists "excluir minhas frases" on public.frases;
create policy "ver frases" on public.frases for select to authenticated using (owner_id is null or owner_id = (select auth.uid()));
create policy "criar minhas frases" on public.frases for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "editar minhas frases" on public.frases for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "excluir minhas frases" on public.frases for delete to authenticated using (owner_id = (select auth.uid()));

-- ============ Aparelho aceita notificações ============
-- O mesmo celular pode trocar de conta (sair e entrar com outra): o aparelho passa para quem entrou.

create or replace function public.registrar_inscricao(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'precisa estar logado'; end if;
  insert into public.push_inscricoes (owner_id, endpoint, p256dh, auth, aparelho)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, coalesce(p_aparelho, ''))
  on conflict (endpoint) do update
    set owner_id = excluded.owner_id, p256dh = excluded.p256dh, auth = excluded.auth,
        aparelho = excluded.aparelho, criado_em = now();
end $$;
revoke execute on function public.registrar_inscricao(text, text, text, text) from public, anon;
grant execute on function public.registrar_inscricao(text, text, text, text) to authenticated;

-- ============ Montar o texto do lembrete ============
-- Escolhe uma frase permitida pela configuração (sem repetir a última, se houver outra) e monta o corpo.

create or replace function public.montar_lembrete(c public.lembrete_config, out titulo text, out corpo text, out frase_id uuid)
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  titulo := c.titulo;
  corpo := c.mensagem;
  if c.com_frase then
    select x.id, x.texto, x.autor into f
    from public.frases x
    where ((x.owner_id is null and c.fonte_frases in ('todas', 'prontas') and not (x.autor = any (c.autores_desligados)))
        or (x.owner_id = c.owner_id and c.fonte_frases in ('todas', 'minhas')))
    order by (x.id is not distinct from c.ultima_frase), random()
    limit 1;
    if found then
      frase_id := f.id;
      corpo := concat_ws(E'\n\n', nullif(c.mensagem, ''), '“' || f.texto || '”' || case when f.autor <> '' then ' — ' || f.autor else '' end);
    end if;
  end if;
end $$;

-- Chamada pela Edge Function a cada 15 minutos. Devolve uma linha por aparelho a avisar agora
-- e marca o dia como avisado (não repete no mesmo dia). Janela: do horário escolhido até 1 hora depois.
create or replace function public.lembretes_devidos(p_agora timestamptz default now())
returns table (owner_id uuid, endpoint text, p256dh text, auth text, titulo text, corpo text)
language plpgsql security definer set search_path = public as $$
declare
  c public.lembrete_config;
  agora_local timestamp;
  m record;
begin
  for c in select * from public.lembrete_config x where x.ativo for update skip locked loop
    agora_local := p_agora at time zone c.fuso;
    continue when agora_local::time < c.hora or agora_local::time - c.hora >= interval '1 hour';
    continue when not (extract(isodow from agora_local)::int = any (c.dias));
    continue when c.ultimo_envio is not null and c.ultimo_envio >= agora_local::date;

    update public.lembrete_config x set ultimo_envio = agora_local::date where x.owner_id = c.owner_id;
    continue when c.pular_se_lancou and exists (
      select 1 from public.transactions t
      where t.owner_id = c.owner_id and (t.created_at at time zone c.fuso)::date = agora_local::date);

    select * into m from public.montar_lembrete(c);
    update public.lembrete_config x set ultima_frase = m.frase_id where x.owner_id = c.owner_id and m.frase_id is not null;
    return query select i.owner_id, i.endpoint, i.p256dh, i.auth, m.titulo, m.corpo
      from public.push_inscricoes i where i.owner_id = c.owner_id;
  end loop;
end $$;

-- Botão "Enviar teste agora": ignora horário e dias e não marca o dia como avisado.
create or replace function public.lembrete_teste(p_owner uuid)
returns table (owner_id uuid, endpoint text, p256dh text, auth text, titulo text, corpo text)
language plpgsql security definer set search_path = public as $$
declare
  c public.lembrete_config;
  m record;
begin
  select * into c from public.lembrete_config x where x.owner_id = p_owner;
  if not found then  -- ainda sem configuração: cria a padrão (desligada) e usa ela
    insert into public.lembrete_config (owner_id) values (p_owner) on conflict do nothing;
    select * into c from public.lembrete_config x where x.owner_id = p_owner;
  end if;
  select * into m from public.montar_lembrete(c);
  return query select i.owner_id, i.endpoint, i.p256dh, i.auth, m.titulo, m.corpo
    from public.push_inscricoes i where i.owner_id = p_owner;
end $$;

-- Só a Edge Function (service_role) chama essas três; o app não.
revoke execute on function public.montar_lembrete(public.lembrete_config) from public, anon, authenticated;
revoke execute on function public.lembretes_devidos(timestamptz) from public, anon, authenticated;
revoke execute on function public.lembrete_teste(uuid) from public, anon, authenticated;
grant execute on function public.montar_lembrete(public.lembrete_config) to service_role;
grant execute on function public.lembretes_devidos(timestamptz) to service_role;
grant execute on function public.lembrete_teste(uuid) to service_role;

-- ============ Frases prontas ============
-- Só frases com autoria conhecida (as famosas de autoria falsa ficaram de fora). Cada um pode desligar autores.

insert into public.frases (owner_id, texto, autor)
select null, v.texto, v.autor
from (values
  ('Preço é o que você paga. Valor é o que você leva.', 'Warren Buffett'),
  ('Regra nº 1: nunca perca dinheiro. Regra nº 2: nunca esqueça a regra nº 1.', 'Warren Buffett'),
  ('Seja medroso quando os outros estão gananciosos, e ganancioso quando os outros estão com medo.', 'Warren Buffett'),
  ('Alguém está sentado à sombra hoje porque alguém plantou uma árvore há muito tempo.', 'Warren Buffett'),
  ('Nosso prazo favorito para manter um investimento é para sempre.', 'Warren Buffett'),
  ('É muito melhor comprar uma empresa maravilhosa a um preço justo do que uma empresa razoável a um preço maravilhoso.', 'Warren Buffett'),
  ('Só quando a maré baixa você descobre quem estava nadando pelado.', 'Warren Buffett'),
  ('O risco vem de não saber o que você está fazendo.', 'Warren Buffett'),
  ('O tempo é amigo da empresa maravilhosa e inimigo da medíocre.', 'Warren Buffett'),
  ('O melhor investimento que você pode fazer é em si mesmo.', 'Warren Buffett'),
  ('Leva 20 anos para construir uma reputação e cinco minutos para arruiná-la.', 'Warren Buffett'),
  ('Você só precisa acertar poucas coisas na vida, desde que não erre em muitas.', 'Warren Buffett'),
  ('A primeira regra dos juros compostos: nunca os interrompa sem necessidade.', 'Charlie Munger'),
  ('O dinheiro grande não está em comprar e vender, mas em esperar.', 'Charlie Munger'),
  ('Passe cada dia tentando ficar um pouco mais sábio do que quando acordou.', 'Charlie Munger'),
  ('O principal problema do investidor, e até seu pior inimigo, provavelmente é ele mesmo.', 'Benjamin Graham'),
  ('No curto prazo, o mercado é uma máquina de votar; no longo prazo, é uma balança.', 'Benjamin Graham'),
  ('Cuidado com as pequenas despesas: um pequeno furo afunda um grande navio.', 'Benjamin Franklin'),
  ('Se você quer ficar rico, pense em poupar tanto quanto em ganhar.', 'Benjamin Franklin'),
  ('Tempo perdido nunca mais é encontrado.', 'Benjamin Franklin'),
  ('Não procure a agulha no palheiro. Compre o palheiro inteiro.', 'John Bogle'),
  ('O tempo é seu amigo; o impulso é seu inimigo.', 'John Bogle'),
  ('Saiba o que você tem e por que você tem.', 'Peter Lynch'),
  ('Gastar dinheiro para mostrar aos outros quanto dinheiro você tem é o jeito mais rápido de ter menos dinheiro.', 'Morgan Housel'),
  ('Riqueza é o que você não vê.', 'Morgan Housel'),
  ('Não é pobre quem tem pouco, mas quem deseja mais.', 'Sêneca'),
  ('Não importa quanto dinheiro você ganha, e sim quanto dinheiro você guarda.', 'Robert Kiyosaki'),
  ('Viva como ninguém vive agora, para depois poder viver como ninguém vive.', 'Dave Ramsey'),
  ('Investir deveria ser como ver a tinta secar ou a grama crescer. Se quer emoção, pegue 800 dólares e vá para Las Vegas.', 'Paul Samuelson'),
  ('A educação formal lhe dará o sustento; a autoeducação lhe dará uma fortuna.', 'Jim Rohn')
) as v (texto, autor)
where not exists (select 1 from public.frases f where f.owner_id is null and f.texto = v.texto);
