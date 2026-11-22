-- Agenda o lembrete diário: a cada 15 minutos, o banco chama a função "lembrete-diario",
-- que confere quem deve ser avisado naquele horário e envia as notificações.
--
-- ANTES DE RODAR: troque COLE-O-SEGREDO-AQUI (linha marcada com <<<) pelo LEMBRETE_SEGREDO
-- que você gerou na página de chaves — o mesmo que está nos Secrets da função.
-- Não salve este arquivo com o segredo no GitHub. Pode rodar de novo sem problema.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Guarda o segredo no cofre do Supabase (Vault), fora do texto do agendamento.
do $$
declare
  segredo text := 'COLE-O-SEGREDO-AQUI';   -- <<< troque pelo LEMBRETE_SEGREDO
  existente uuid;
begin
  if segredo = 'COLE-O-SEGREDO-AQUI' or length(segredo) < 20 then
    raise exception 'Troque COLE-O-SEGREDO-AQUI pelo LEMBRETE_SEGREDO antes de rodar (nada foi alterado).';
  end if;
  select id into existente from vault.secrets where name = 'lembrete_segredo';
  if existente is null then
    perform vault.create_secret(segredo, 'lembrete_segredo', 'Segredo do agendamento do lembrete diário');
  else
    perform vault.update_secret(existente, segredo);
  end if;
end $$;

-- Se já existir um agendamento com este nome, ele é atualizado.
select cron.schedule(
  'lembrete-diario',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://qtgkpnejimlrkjdhrqfh.supabase.co/functions/v1/lembrete-diario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-lembrete-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'lembrete_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Para conferir depois de 15 minutos (rode separado):
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content, created from net._http_response order by created desc limit 5;
-- Para parar o lembrete de todo mundo:
--   select cron.unschedule('lembrete-diario');
