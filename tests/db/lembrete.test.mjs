import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Lembrete diário (migração 006). Testado no banco novo (schema.sql) e no banco em uso
// (schema antigo + migrações 003 a 006, com a 006 rodando duas vezes).
const PG = { host: '/var/tmp/pgtest', port: '5499' };
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const psql = (db, sql) => execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq', '-F', '|', '-c', sql],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const run = (db, sql) => execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q'],
  { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
const ler = (f) => readFileSync(f, 'utf8');
const fails = (fn, re) => assert.throws(fn, (e) => re.test(String(e.stderr || e.message)));
const m005 = () => ler('supabase/migracao-005-privacidade.sql').replace('COLOQUE-SEU-EMAIL-AQUI', 'matheus@x.com');

const bancos = {
  finlemb_novo: () => ler('supabase/schema.sql'),
  finlemb_migrado: () => execFileSync('git', ['show', '1004d1f:supabase/schema.sql'], { encoding: 'utf8' }) + '\n' +
    ler('supabase/migracao-003-extraordinario-excluir-tags.sql') + '\n' + ler('supabase/migracao-004-extraordinario-parcial.sql') + '\n' +
    m005() + '\n' + ler('supabase/migracao-006-lembrete-diario.sql') + '\n' + ler('supabase/migracao-006-lembrete-diario.sql'),
};

before(() => {
  for (const [db, sql] of Object.entries(bancos)) {
    psql('postgres', `drop database if exists ${db}`);
    psql('postgres', `create database ${db}`);
    run(db, ler('tests/db/supabase-stub.sql') + sql());
    psql(db, `insert into auth.users values ('${A}','matheus@x.com'),('${B}','denise@x.com')`);
  }
});

for (const db of Object.keys(bancos)) {
  const q = (sql) => psql(db, sql);
  const as = (uid, sql) => psql(db, `begin; set local role authenticated; set local request.jwt.claim.sub = '${uid}'; ${sql}; commit;`);
  const servico = (sql) => psql(db, `begin; set local role service_role; ${sql}; commit;`);
  // Horário de Brasília (-03:00) do dia 23/11/2026, uma segunda-feira.
  const devidos = (hora, dia = '2026-11-23') => servico(`select owner_id, endpoint, titulo, corpo from lembretes_devidos('${dia} ${hora}:00-03')`);
  const limpar = () => q(`delete from lembrete_config; delete from push_inscricoes; delete from transactions; delete from frases where owner_id is not null`);

  test(`[${db}] frases prontas vêm na migração e não duplicam`, () => {
    assert.equal(q(`select count(*) from frases where owner_id is null`), '30');
    assert.equal(q(`select count(*) from frases where owner_id is null and autor = 'Warren Buffett'`), '12');
    assert.equal(q(`select count(*) from frases where texto ilike '%oitava maravilha%'`), '0');
  });

  test(`[${db}] configuração, aparelhos e frases próprias: cada um só vê e mexe no seu`, () => {
    limpar();
    as(A, `insert into lembrete_config (hora) values ('20:30')`);
    assert.equal(as(A, `select hora, ativo, pular_se_lancou, com_frase, fonte_frases from lembrete_config`), '20:30:00|f|t|t|todas');
    assert.equal(as(B, `select count(*) from lembrete_config`), '0');
    as(B, `update lembrete_config set hora = '05:00'`);
    assert.equal(q(`select hora from lembrete_config where owner_id = '${A}'`), '20:30:00');
    fails(() => as(B, `insert into lembrete_config (owner_id) values ('${A}')`), /row-level security|duplicate key/);

    as(B, `insert into frases (texto, autor) values ('Pague-se primeiro.', 'Denise')`);
    assert.equal(as(A, `select count(*) from frases where owner_id is not null`), '0');
    assert.equal(as(B, `select count(*) from frases`), '31');
    as(B, `update frases set texto = 'mudei' where owner_id is null`);
    as(B, `delete from frases where owner_id is null`);
    assert.equal(q(`select count(*) from frases where owner_id is null and texto = 'mudei'`), '0');
    assert.equal(q(`select count(*) from frases where owner_id is null`), '30');
    fails(() => as(A, `insert into frases (owner_id, texto) values (null, 'pronta falsa')`), /row-level security/);
  });

  test(`[${db}] aparelho: registra pela função, troca de dono ao trocar de conta, e não grava direto`, () => {
    limpar();
    as(A, `select registrar_inscricao('https://push.x/abc', 'chaveP', 'segredoA', 'Android')`);
    assert.equal(as(A, `select endpoint || ' ' || aparelho from push_inscricoes`), 'https://push.x/abc Android');
    as(B, `select registrar_inscricao('https://push.x/abc', 'chaveP2', 'segredoB', 'Android')`);
    assert.equal(as(A, `select count(*) from push_inscricoes`), '0');
    assert.equal(as(B, `select p256dh || ' ' || auth from push_inscricoes`), 'chaveP2 segredoB');
    fails(() => as(A, `insert into push_inscricoes (endpoint, p256dh, auth) values ('x','y','z')`), /permission denied/);
    as(A, `delete from push_inscricoes`);
    assert.equal(q(`select count(*) from push_inscricoes`), '1');
    as(B, `delete from push_inscricoes where endpoint = 'https://push.x/abc'`);
    assert.equal(q(`select count(*) from push_inscricoes`), '0');
  });

  test(`[${db}] o app não consegue chamar as funções de envio`, () => {
    fails(() => as(A, `select * from lembretes_devidos()`), /permission denied/);
    fails(() => as(A, `select * from lembrete_teste('${A}')`), /permission denied/);
    fails(() => psql(db, `begin; set local role anon; select registrar_inscricao('a','b','c'); commit;`), /permission denied/);
  });

  test(`[${db}] avisa no horário escolhido, uma vez por dia, só nos dias marcados`, () => {
    limpar();
    as(A, `insert into lembrete_config (ativo, hora, com_frase, mensagem) values (true, '21:00', false, 'Lança aí')`);
    as(A, `select registrar_inscricao('https://push.x/celular', 'p', 'a', 'Android')`);
    as(A, `select registrar_inscricao('https://push.x/pc', 'p', 'a', 'PC')`);
    assert.equal(devidos('20:50'), '', 'antes do horário');
    const r = devidos('21:05').split('\n').sort();
    assert.deepEqual(r, [`${A}|https://push.x/celular|Hora de lançar os gastos|Lança aí`, `${A}|https://push.x/pc|Hora de lançar os gastos|Lança aí`]);
    assert.equal(devidos('21:20'), '', 'já avisou hoje');
    assert.equal(q(`select ultimo_envio from lembrete_config`), '2026-11-23');
    assert.equal(devidos('22:10', '2026-11-24'), '', 'passou da janela de 1 hora');
    assert.notEqual(devidos('21:00', '2026-11-25'), '', 'outro dia avisa de novo');
    as(A, `update lembrete_config set dias = '{6,7}', ultimo_envio = null`);
    assert.equal(devidos('21:05', '2026-11-26'), '', 'quinta-feira não está marcada');
    assert.notEqual(devidos('21:05', '2026-11-28'), '', 'sábado está marcado');
    as(A, `update lembrete_config set ativo = false, ultimo_envio = null`);
    assert.equal(devidos('21:05', '2026-11-29'), '', 'desligado');
  });

  test(`[${db}] não avisa quem já lançou algo no dia (se pedir), e avisa os outros`, () => {
    limpar();
    for (const u of [A, B]) {
      as(u, `insert into lembrete_config (ativo, hora, com_frase) values (true, '21:00', false)`);
      as(u, `select registrar_inscricao('https://push.x/${u}', 'p', 'a', '')`);
    }
    as(B, `insert into transactions (owner_id, kind, amount_cents, purchase_date, competence_date, created_at)
           values ('${B}', 'gasto', 100, '2026-11-20', '2026-11-20', '2026-11-23 19:00:00-03')`);
    assert.deepEqual(devidos('21:05').split('\n').map((l) => l.split('|')[0]), [A]);
    assert.equal(q(`select ultimo_envio from lembrete_config where owner_id = '${B}'`), '2026-11-23');
    // Lançado ontem não conta.
    assert.deepEqual(devidos('21:05', '2026-11-24').split('\n').map((l) => l.split('|')[0]).sort(), [A, B].sort());
    as(B, `update lembrete_config set pular_se_lancou = false, ultimo_envio = null`);
    assert.match(devidos('21:05'), new RegExp(B));
  });

  test(`[${db}] frase: entra no texto, respeita a origem e os autores desligados e não repete em seguida`, () => {
    limpar();
    as(A, `insert into lembrete_config (ativo, hora, mensagem) values (true, '08:00', 'Bom dia')`);
    as(A, `select registrar_inscricao('https://push.x/a', 'p', 'a', '')`);
    const corpo = (dia) => { q(`update lembrete_config set ultimo_envio = null`); return devidos('08:00', dia).split('|')[3]; };
    assert.match(corpo('2026-11-23'), /^Bom dia\n\n“.+” — .+$/);

    as(A, `update lembrete_config set autores_desligados = (select array_agg(distinct autor) from frases where owner_id is null and autor <> 'Sêneca')`);
    assert.match(corpo('2026-11-24'), /— Sêneca$/);

    as(A, `insert into frases (texto, autor) values ('Primeiro eu.', ''), ('Depois eu.', 'Eu')`);
    as(A, `update lembrete_config set fonte_frases = 'minhas'`);
    const vistos = [1, 2, 3, 4].map((d) => corpo(`2026-12-0${d}`));
    for (const v of vistos) assert.match(v, /^Bom dia\n\n“(Primeiro eu\.”|Depois eu\.” — Eu)$/);
    for (let i = 1; i < vistos.length; i++) assert.notEqual(vistos[i], vistos[i - 1], 'repetiu a frase do dia anterior');

    as(A, `update lembrete_config set fonte_frases = 'prontas', autores_desligados = '{}'`);
    assert.doesNotMatch(corpo('2026-12-05'), /Primeiro eu|Depois eu/);

    as(A, `update lembrete_config set com_frase = false`);
    assert.equal(corpo('2026-12-06'), 'Bom dia');
  });

  test(`[${db}] teste: avisa agora, sem marcar o dia; sem configuração usa a padrão`, () => {
    limpar();
    as(B, `select registrar_inscricao('https://push.x/b', 'p', 'a', '')`);
    const r = servico(`select endpoint, titulo, corpo from lembrete_teste('${B}')`);
    assert.match(r, /^https:\/\/push\.x\/b\|Hora de lançar os gastos\|Leva um minuto/);
    assert.equal(q(`select ativo::text || coalesce(ultimo_envio::text, '-') from lembrete_config where owner_id = '${B}'`), 'false-');
    as(B, `update lembrete_config set ativo = true, hora = '09:00'`);
    servico(`select * from lembrete_teste('${B}')`);
    assert.equal(q(`select coalesce(ultimo_envio::text, '-') from lembrete_config where owner_id = '${B}'`), '-');
  });
}
