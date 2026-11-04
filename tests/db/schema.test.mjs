import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PG = { host: process.env.PGTEST_HOST || '/var/tmp/pgtest', port: process.env.PGTEST_PORT || '5499' };
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

function psql(db, sql) {
  return execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function psqlFile(db, file) {
  execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-q', '-f', file], { stdio: ['ignore', 'pipe', 'pipe'] });
}
// Executa SQL como um usuário logado (ou anon quando uid é null).
function as(uid, sql) {
  const role = uid ? 'authenticated' : 'anon';
  const claim = uid ? `set local request.jwt.claim.sub = '${uid}';` : '';
  return psql('finteste', `begin; set local role ${role}; ${claim} ${sql}; commit;`);
}
function fails(fn, re) { assert.throws(fn, (e) => re.test(String(e.stderr || e.message))); }

before(() => {
  psql('postgres', 'drop database if exists finteste');
  psql('postgres', 'drop database if exists finteste_mig');
  psql('postgres', 'create database finteste');
  psqlFile('finteste', 'tests/db/supabase-stub.sql');
  psqlFile('finteste', 'supabase/schema.sql');
  psql('finteste', `insert into auth.users values ('${A}','matheus@x.com'),('${B}','ela@x.com')`);
});

test('as 7 tabelas existem com RLS ligado', () => {
  const out = psql('finteste', "select tablename||':'||rowsecurity from pg_tables where schemaname='public' order by 1");
  assert.equal(out, ['budgets:true', 'goal_deposits:true', 'goals:true', 'profiles:true', 'recurrences:true', 'tags:true', 'transactions:true'].join('\n'));
});

test('novo usuário em auth.users ganha perfil com o e-mail como nome', () => {
  assert.equal(psql('finteste', `select name from profiles where id='${A}'`), 'matheus@x.com');
});

test('usuário grava lançamento próprio e não consegue gravar em nome do outro', () => {
  as(A, `insert into transactions(owner_id,kind,amount_cents,description,purchase_date,competence_date,payment)
         values ('${A}','gasto',4890,'Padaria','2026-11-02','2026-11-02','pix')`);
  fails(() => as(A, `insert into transactions(owner_id,kind,amount_cents,description,purchase_date,competence_date,payment)
         values ('${B}','gasto',100,'x','2026-11-02','2026-11-02','pix')`), /row-level security/);
});

test('a outra pessoa vê, mas não altera nem exclui, o lançamento', () => {
  assert.equal(as(B, `select description from transactions where owner_id='${A}'`), 'Padaria');
  as(B, `update transactions set amount_cents=1 where owner_id='${A}'`);
  as(B, `delete from transactions where owner_id='${A}'`);
  assert.equal(psql('finteste', `select amount_cents from transactions where owner_id='${A}'`), '4890');
});

test('visitante sem login não lê nada', () => {
  fails(() => as(null, 'select * from tags'), /permission denied/);
  fails(() => as(null, 'select * from transactions'), /permission denied/);
});

test('tags: qualquer logado cria e edita, ninguém exclui', () => {
  as(A, `insert into tags(name,color,icon,created_by) values ('Moradia','#6F4E37','home','${A}')`);
  as(B, `update tags set name='Casa' where name='Moradia'`);
  assert.equal(psql('finteste', `select name from tags`), 'Casa');
  fails(() => as(A, `delete from tags`), /permission denied/);
});

test('o mesmo recorrente não gera dois lançamentos na mesma competência', () => {
  const r = as(A, `insert into recurrences(owner_id,kind,amount_cents,description,payment,day_of_month,start_month)
                   values ('${A}','gasto',80000,'Aluguel','credito',5,'2026-11-01') returning id`);
  const ins = `insert into transactions(owner_id,kind,amount_cents,description,purchase_date,competence_date,payment,recurrence_id)
               values ('${A}','gasto',80000,'Aluguel','2026-11-05','2026-12-10','credito','${r}')`;
  as(A, ins);
  fails(() => as(A, ins), /duplicate key/);
});

test('tipo e pagamento só aceitam os valores combinados', () => {
  fails(() => as(A, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date)
         values ('${A}','saque',1,'2026-11-02','2026-11-02')`), /check constraint/);
  fails(() => as(A, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date,payment)
         values ('${A}','gasto',1,'2026-11-02','2026-11-02','boleto')`), /check constraint/);
});

test('orçamento é um por pessoa e por tag', () => {
  const t = psql('finteste', `select id from tags limit 1`);
  as(A, `insert into budgets(owner_id,tag_id,monthly_cents) values ('${A}','${t}',100000)`);
  fails(() => as(A, `insert into budgets(owner_id,tag_id,monthly_cents) values ('${A}','${t}',5)`), /duplicate key/);
  as(B, `insert into budgets(owner_id,tag_id,monthly_cents) values ('${B}','${t}',50000)`);
});

test('mesmo recorrente não gera dois lançamentos no mesmo mês, mesmo com dia diferente', () => {
  const r = as(A, `insert into recurrences(owner_id,kind,amount_cents,description,payment,day_of_month,start_month)
                   values ('${A}','gasto',5000,'Internet','pix',20,'2026-11-01') returning id`);
  as(A, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date,payment,recurrence_id)
         values ('${A}','gasto',5000,'2026-11-20','2026-11-20','pix','${r}')`);
  fails(() => as(A, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date,payment,recurrence_id)
         values ('${A}','gasto',5000,'2026-11-22','2026-11-22','pix','${r}')`), /duplicate key/);
});

test('ninguém registra valor guardado na meta da outra pessoa', () => {
  const g = as(A, `insert into goals(owner_id,name,target_cents) values ('${A}','Viagem',100000) returning id`);
  fails(() => as(B, `insert into goal_deposits(goal_id,owner_id,amount_cents) values ('${g}','${B}',500)`), /row-level security/);
  as(A, `insert into goal_deposits(goal_id,owner_id,amount_cents) values ('${g}','${A}',500)`);
});

test('ninguém cria lançamento usando o recorrente da outra pessoa', () => {
  const r = as(A, `insert into recurrences(owner_id,kind,amount_cents,description,payment,day_of_month,start_month)
                   values ('${A}','gasto',100,'Gym','pix',3,'2026-11-01') returning id`);
  fails(() => as(B, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date,payment,recurrence_id)
         values ('${B}','gasto',100,'2026-12-03','2026-12-03','pix','${r}')`), /row-level security/);
});

test('doação é aceita como tipo de lançamento e de recorrente', () => {
  as(A, `insert into transactions(owner_id,kind,amount_cents,purchase_date,competence_date,payment)
         values ('${A}','doacao',5000,'2026-11-03','2026-11-03','pix')`);
  as(A, `insert into recurrences(owner_id,kind,amount_cents,description,payment,day_of_month,start_month)
         values ('${A}','doacao',10000,'Dízimo','pix',10,'2026-11-01')`);
});

test('atualização 002 em um banco antigo passa a aceitar doação', () => {
  psql('postgres', 'drop database if exists finteste_mig');
  psql('postgres', 'create database finteste_mig');
  const old = execFileSync('git', ['show', 'b061391:supabase/schema.sql'], { encoding: 'utf8' });
  execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', 'finteste_mig', '-v', 'ON_ERROR_STOP=1', '-q'],
    { input: readFileSync('tests/db/supabase-stub.sql', 'utf8') + old, stdio: ['pipe', 'pipe', 'pipe'] });
  psql('finteste_mig', `insert into auth.users values ('${A}','m@x.com')`);
  const ins = `insert into public.transactions(owner_id,kind,amount_cents,purchase_date,competence_date) values ('${A}','doacao',1,'2026-11-03','2026-11-03')`;
  assert.throws(() => psql('finteste_mig', ins));
  psqlFile('finteste_mig', 'supabase/migracao-002-doacoes.sql');
  psqlFile('finteste_mig', 'supabase/migracao-002-doacoes.sql'); // rodar duas vezes não quebra
  psql('finteste_mig', ins);
});
