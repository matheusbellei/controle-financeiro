-- Atualização 005 — cada conta só vê os próprios dados, e cada um tem as próprias tags.
-- 1) Antes, qualquer conta logada podia ler lançamentos, recorrentes, limites e metas das outras
--    (a tela escondia, mas o banco entregava). Agora o banco só entrega o que é seu.
-- 2) Tags e subtags deixam de ser compartilhadas. As tags de hoje ficam com você (dono);
--    a outra conta recebe uma cópia de cada uma, e os lançamentos, recorrentes e limites
--    dela passam a usar as cópias. Daí em diante cada um muda as suas sem afetar o outro.
--
-- ANTES DE RODAR: troque o e-mail na linha marcada com  <<<  pelo seu e-mail de login.
-- Se o e-mail estiver errado, o script para com "não encontrei…" e nada muda.
-- Pode rodar de novo sem problema: nada é copiado duas vezes.

begin;

do $$
declare t text;
begin
  foreach t in array array['transactions','recurrences','budgets','goals','goal_deposits'] loop
    execute format('drop policy if exists "ver" on public.%I', t);
    execute format('drop policy if exists "ver o meu" on public.%I', t);
    execute format('create policy "ver o meu" on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

drop policy if exists "ver perfis" on public.profiles;
drop policy if exists "ver meu perfil" on public.profiles;
create policy "ver meu perfil" on public.profiles for select to authenticated using (id = (select auth.uid()));

-- ============ Tags por pessoa ============

alter table public.tags add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.tags alter column owner_id set default auth.uid();

do $$
declare
  dono uuid;
  u record;
begin
  if not exists (select 1 from public.tags where owner_id is null) then return; end if;

  select id into dono from auth.users
  where lower(email) = lower(trim('COLOQUE-SEU-EMAIL-AQUI'));   -- <<< seu e-mail de login
  if dono is null then
    raise exception 'não encontrei nenhuma conta com esse e-mail. Confira o e-mail na linha marcada com <<< e rode de novo (nada foi alterado).';
  end if;

  update public.tags set owner_id = dono where owner_id is null;

  drop table if exists pg_temp.mapa_tags;
  create temp table mapa_tags (velho uuid primary key, novo uuid not null);

  for u in select id from auth.users where id <> dono loop
    delete from mapa_tags;
    insert into mapa_tags select id, gen_random_uuid() from public.tags where owner_id = dono;

    -- tags principais primeiro, depois as subtags apontando para a cópia da tag-mãe
    insert into public.tags (id, name, color, icon, parent_id, archived, created_by, owner_id)
    select m.novo, t.name, t.color, t.icon, null, t.archived, t.created_by, u.id
    from public.tags t join mapa_tags m on m.velho = t.id where t.parent_id is null;
    insert into public.tags (id, name, color, icon, parent_id, archived, created_by, owner_id)
    select m.novo, t.name, t.color, t.icon, mp.novo, t.archived, t.created_by, u.id
    from public.tags t join mapa_tags m on m.velho = t.id join mapa_tags mp on mp.velho = t.parent_id;

    update public.transactions x set tag_id = m.novo from mapa_tags m where x.owner_id = u.id and x.tag_id = m.velho;
    update public.recurrences  x set tag_id = m.novo from mapa_tags m where x.owner_id = u.id and x.tag_id = m.velho;
    update public.budgets      x set tag_id = m.novo from mapa_tags m where x.owner_id = u.id and x.tag_id = m.velho;
  end loop;

  drop table mapa_tags;
end $$;

alter table public.tags alter column owner_id set not null;
create index if not exists tags_owner_idx on public.tags (owner_id);

drop policy if exists "ver tags" on public.tags;
drop policy if exists "criar tags" on public.tags;
drop policy if exists "editar tags" on public.tags;
drop policy if exists "excluir tags" on public.tags;
drop policy if exists "ver minhas tags" on public.tags;
drop policy if exists "criar minhas tags" on public.tags;
drop policy if exists "editar minhas tags" on public.tags;
drop policy if exists "excluir minhas tags" on public.tags;
create policy "ver minhas tags" on public.tags for select to authenticated using (owner_id = (select auth.uid()));
create policy "criar minhas tags" on public.tags for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "editar minhas tags" on public.tags for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "excluir minhas tags" on public.tags for delete to authenticated using (owner_id = (select auth.uid()));

commit;
