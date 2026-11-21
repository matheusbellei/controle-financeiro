import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Cada conta só lê os próprios dados. Testado nos dois caminhos: banco novo (schema.sql)
// e banco já em uso (schema antigo + migrações 003, 004 e 005, como o do Matheus).
const PG = { host: '/var/tmp/pgtest', port: '5499' };
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const psql = (db, sql) => execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const run = (db, sql) => execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q'],
  { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
const stub = readFileSync('tests/db/supabase-stub.sql', 'utf8');
const ler = (f) => readFileSync(f, 'utf8');

function montar(db, sql) {
  psql('postgres', `drop database if exists ${db}`);
  psql('postgres', `create database ${db}`);
  run(db, stub + sql);
  psql(db, `insert into auth.users values ('${A}','matheus@x.com'),('${B}','denise@x.com')`);
}
const bancos = {
  finpriv_novo: () => ler('supabase/schema.sql'),
  finpriv_migrado: () => execFileSync('git', ['show', '1004d1f:supabase/schema.sql'], { encoding: 'utf8' }) + '\n' +
    ler('supabase/migracao-003-extraordinario-excluir-tags.sql') + '\n' + ler('supabase/migracao-004-extraordinario-parcial.sql') + '\n' +
    ler('supabase/migracao-005-privacidade.sql').replace('COLOQUE-SEU-EMAIL-AQUI', 'matheus@x.com') + '\n' +
    ler('supabase/migracao-005-privacidade.sql').replace('COLOQUE-SEU-EMAIL-AQUI', 'matheus@x.com'),
};
before(() => { for (const [db, sql] of Object.entries(bancos)) montar(db, sql()); });

for (const db of Object.keys(bancos)) {
  const as = (uid, sql) => psql(db, `begin; set local role authenticated; set local request.jwt.claim.sub = '${uid}'; ${sql}; commit;`);

  test(`[${db}] cada um lê só os próprios dados, inclusive as tags`, () => {
    const tag = as(A, `insert into tags(name) values ('Moradia') returning id`);
    const rec = as(A, `insert into recurrences(owner_id,kind,amount_cents,day_of_month,start_month,tag_id) values ('${A}','gasto',100,5,'2026-11-01','${tag}') returning id`);
    as(A, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date,tag_id,recurrence_id) values ('${A}','gasto',100,'2026-11-05','2026-11-05','${tag}','${rec}')`);
    as(A, `insert into budgets(owner_id,tag_id,monthly_cents) values ('${A}','${tag}',1000)`);
    const meta = as(A, `insert into goals(owner_id,name,target_cents) values ('${A}','Viagem',1000) returning id`);
    as(A, `insert into goal_deposits(goal_id,owner_id,amount_cents) values ('${meta}','${A}',10)`);
    for (const t of ['transactions', 'recurrences', 'budgets', 'goals', 'goal_deposits']) {
      assert.equal(as(B, `select count(*) from ${t}`), '0', `Denise vê ${t} do Matheus`);
      assert.equal(as(A, `select count(*) from ${t}`), '1', `Matheus não vê os próprios ${t}`);
    }
    assert.equal(as(B, `select count(*) from profiles`), '1');
    assert.equal(as(B, `select count(*) from tags`), '0', 'Denise vê tag do Matheus');
    assert.equal(as(A, `select name from tags`), 'Moradia');
  });

  test(`[${db}] continua gravando e excluindo só o que é seu`, () => {
    as(B, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date) values ('${B}','gasto',5,'2026-11-05','2026-11-05')`);
    as(B, `delete from transactions`);
    assert.equal(as(A, `select count(*) from transactions`), '1');
    assert.equal(as(B, `select count(*) from transactions`), '0');
  });
}
