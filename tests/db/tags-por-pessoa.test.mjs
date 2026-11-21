import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Banco em uso (como o do Matheus) recebendo a migração 005: tags passam a ter dono.
// O Matheus fica com as tags de hoje; a Denise recebe cópias, e os dados dela apontam para elas.
const PG = { host: '/var/tmp/pgtest', port: '5499' };
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const DB = 'fintags';
const psql = (sql) => execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const run = (sql) => execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-q'],
  { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
const as = (uid, sql) => psql(`begin; set local role authenticated; set local request.jwt.claim.sub = '${uid}'; ${sql}; commit;`);
const migracao = (email) => readFileSync('supabase/migracao-005-privacidade.sql', 'utf8').replace('COLOQUE-SEU-EMAIL-AQUI', email);
let t = {};

before(() => {
  execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', 'postgres', '-Atqc', `drop database if exists ${DB}`]);
  execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', 'postgres', '-Atqc', `create database ${DB}`]);
  run(readFileSync('tests/db/supabase-stub.sql', 'utf8') + execFileSync('git', ['show', '1004d1f:supabase/schema.sql'], { encoding: 'utf8' }) +
    readFileSync('supabase/migracao-003-extraordinario-excluir-tags.sql', 'utf8') + readFileSync('supabase/migracao-004-extraordinario-parcial.sql', 'utf8'));
  psql(`insert into auth.users values ('${A}','matheus@x.com'),('${B}','denise@x.com')`);
  // Situação de hoje: lista única; uma tag criada pela Denise; os dois usam as tags.
  t.ali = as(A, `insert into tags(name,color,icon) values ('Alimentação','#C68B59','coffee') returning id`);
  t.mer = as(A, `insert into tags(name,color,icon,parent_id) values ('Mercado','#D4A373','shopping-cart','${t.ali}') returning id`);
  t.est = as(B, `insert into tags(name,color,icon) values ('Estética','#D81B60','scissors') returning id`);
  as(A, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date,tag_id) values ('${A}','gasto',100,'2026-11-01','2026-11-01','${t.mer}')`);
  as(B, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date,tag_id) values ('${B}','gasto',200,'2026-11-01','2026-11-01','${t.mer}')`);
  as(B, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date,tag_id) values ('${B}','gasto',300,'2026-11-01','2026-11-01','${t.est}')`);
  as(B, `insert into recurrences(owner_id,kind,amount_cents,day_of_month,start_month,tag_id) values ('${B}','gasto',50,5,'2026-11-01','${t.ali}')`);
  as(B, `insert into budgets(owner_id,tag_id,monthly_cents) values ('${B}','${t.ali}',1000)`);
});

test('e-mail errado: o script para e nada muda', () => {
  assert.throws(() => run(migracao('ninguem@x.com')), /não encontrei/);
  assert.equal(psql(`select count(*) from tags`), '3');
});

test('com o e-mail certo: as tags de hoje ficam com o Matheus', () => {
  run(migracao('matheus@x.com'));
  assert.equal(psql(`select string_agg(name, ',' order by name) from tags where owner_id='${A}'`), 'Alimentação,Estética,Mercado');
  assert.equal(psql(`select count(*) from tags where id in ('${t.ali}','${t.mer}','${t.est}') and owner_id='${A}'`), '3');
});

test('a Denise recebe cópias com a mesma cara e a mesma estrutura', () => {
  assert.equal(psql(`select string_agg(name||':'||color||':'||icon, ',' order by name) from tags where owner_id='${B}'`),
    'Alimentação:#C68B59:coffee,Estética:#D81B60:scissors,Mercado:#D4A373:shopping-cart');
  assert.equal(psql(`select p.name from tags s join tags p on p.id = s.parent_id where s.owner_id='${B}' and s.name='Mercado'`), 'Alimentação');
  assert.equal(psql(`select p.owner_id from tags s join tags p on p.id = s.parent_id where s.owner_id='${B}'`), B);
});

test('os dados da Denise apontam para as cópias dela; os do Matheus não mudam', () => {
  assert.equal(psql(`select count(*) from transactions x join tags g on g.id = x.tag_id where x.owner_id='${B}' and g.owner_id='${B}'`), '2');
  assert.equal(psql(`select g.owner_id from recurrences r join tags g on g.id = r.tag_id where r.owner_id='${B}'`), B);
  assert.equal(psql(`select g.owner_id from budgets b join tags g on g.id = b.tag_id where b.owner_id='${B}'`), B);
  assert.equal(psql(`select tag_id from transactions where owner_id='${A}'`), t.mer);
});

test('cada um só vê e mexe nas próprias tags', () => {
  assert.equal(as(B, `select count(*) from tags`), '3');
  as(B, `update tags set name='Comida' where name='Alimentação'`);
  assert.equal(psql(`select name from tags where id='${t.ali}'`), 'Alimentação');
  as(B, `delete from tags where id='${t.est}'`);
  assert.equal(psql(`select count(*) from tags where id='${t.est}'`), '1');
  const nova = as(B, `insert into tags(name) values ('Pilates') returning owner_id`);
  assert.equal(nova, B);
  assert.equal(as(A, `select count(*) from tags where name='Pilates'`), '0');
});

test('rodar de novo não duplica nada', () => {
  const antes = psql(`select count(*) from tags`);
  run(migracao('matheus@x.com'));
  assert.equal(psql(`select count(*) from tags`), antes);
});
