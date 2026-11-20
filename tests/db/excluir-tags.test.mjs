import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PG = { host: '/var/tmp/pgtest', port: '5499' };
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const DB = 'finteste_excluir';
const psql = (db, sql) => execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const run = (db, sql) => execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q'],
  { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
const as = (uid, sql) => psql(DB, `begin; set local role authenticated; set local request.jwt.claim.sub = '${uid}'; ${sql}; commit;`);

// Banco "antigo" (antes da atualização 003) + a atualização: é o caminho do Matheus.
before(() => {
  psql('postgres', `drop database if exists ${DB}`);
  psql('postgres', `create database ${DB}`);
  const antigo = execFileSync('git', ['show', '1004d1f:supabase/schema.sql'], { encoding: 'utf8' });
  run(DB, readFileSync('tests/db/supabase-stub.sql', 'utf8') + antigo);
  run(DB, readFileSync('supabase/migracao-003-extraordinario-excluir-tags.sql', 'utf8'));
  psql(DB, `insert into auth.users values ('${A}','m@x.com'),('${B}','d@x.com')`);
});

test('excluir tag deixa os lançamentos dos dois sem tag, apaga subtags e limites', () => {
  const mae = as(A, `insert into tags(name) values ('Estética') returning id`);
  const sub = as(A, `insert into tags(name, parent_id) values ('Cabelo', '${mae}') returning id`);
  as(A, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date,tag_id) values ('${A}','gasto',100,'2026-11-01','2026-11-01','${sub}')`);
  as(B, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date,tag_id) values ('${B}','gasto',200,'2026-11-01','2026-11-01','${mae}')`);
  as(A, `insert into recurrences(owner_id,kind,amount_cents,day_of_month,start_month,tag_id) values ('${A}','gasto',100,5,'2026-11-01','${mae}')`);
  as(A, `insert into budgets(owner_id,tag_id,monthly_cents) values ('${A}','${mae}',10000)`);
  as(A, `delete from tags where id='${mae}'`);
  assert.equal(psql(DB, `select count(*) from tags`), '0');
  assert.equal(psql(DB, `select count(*) from transactions where tag_id is null`), '2');
  assert.equal(psql(DB, `select count(*) from recurrences where tag_id is null`), '1');
  assert.equal(psql(DB, `select count(*) from budgets`), '0');
});

test('excluir só a subtag mantém a tag-mãe', () => {
  const mae = as(A, `insert into tags(name) values ('Academia') returning id`);
  const sub = as(A, `insert into tags(name, parent_id) values ('Suplemento', '${mae}') returning id`);
  as(A, `delete from tags where id='${sub}'`);
  assert.equal(psql(DB, `select name from tags`), 'Academia');
});

test('visitante sem login continua sem conseguir excluir', () => {
  const t = as(A, `insert into tags(name) values ('Lazer') returning id`);
  assert.throws(() => psql(DB, `begin; set local role anon; delete from tags where id='${t}'; commit;`));
});
