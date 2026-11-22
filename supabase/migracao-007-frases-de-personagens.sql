-- Atualização 007 — troca de frases prontas do lembrete.
-- Sai: Dave Ramsey e a do Buffett sobre a maré. Entram 5 frases de personagens sobre dinheiro.
-- Rode uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- Não mexe nas frases que cada um criou nem nas configurações.

begin;

delete from public.frases
where owner_id is null
  and texto in ('Só quando a maré baixa você descobre quem estava nadando pelado.',
                'Viva como ninguém vive agora, para depois poder viver como ninguém vive.');

insert into public.frases (owner_id, texto, autor)
select null, v.texto, v.autor
from (values
  ('Fiquei rico sendo mais durão que os durões e mais esperto que os espertos.', 'Tio Patinhas (quadrinhos da Disney)'),
  ('Não existe trabalho ruim. O ruim é ter que trabalhar.', 'Seu Madruga (Chaves)'),
  ('Você não é o quanto tem no banco.', 'Tyler Durden (Clube da Luta)'),
  ('Eu gosto de dinheiro.', 'Sr. Siriguejo (Bob Esponja)'),
  ('Me venda esta caneta.', 'Jordan Belfort (O Lobo de Wall Street)')
) as v (texto, autor)
where not exists (select 1 from public.frases f where f.owner_id is null and f.texto = v.texto);

commit;
