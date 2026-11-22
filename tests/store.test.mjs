import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadSection } from './load-rules.mjs';
import { fakeClient } from './fake-supabase.mjs';

function makeStore(client) {
  const ctx = vm.createContext({ Promise, Error, Object, Array });
  vm.runInContext(loadSection(3), ctx);
  return ctx.createStore(client);
}
const ops = (c) => JSON.parse(JSON.stringify(c.ops));

test('list aplica período de competência e dono', async () => {
  const client = fakeClient({ data: [{ id: 1 }], error: null });
  const s = makeStore(client);
  const rows = await s.list('transactions', { competence_from: '2026-11-01', competence_to: '2026-11-30', owner_id: 'u1' });
  assert.equal(rows.length, 1);
  assert.equal(client.calls[0].table, 'transactions');
  assert.deepEqual(ops(client.calls[0]), [['select', '*'], ['gte', 'competence_date', '2026-11-01'],
    ['lte', 'competence_date', '2026-11-30'], ['eq', 'owner_id', 'u1'], ['order', 'id'], ['range', 0, 999]]);
});

test('list sem filtros busca a tabela inteira', async () => {
  const client = fakeClient({ data: [], error: null });
  await makeStore(client).list('tags');
  assert.deepEqual(ops(client.calls[0]), [['select', '*'], ['order', 'id'], ['range', 0, 999]]);
});

test('insert devolve as linhas criadas', async () => {
  const client = fakeClient({ data: [{ id: 'x' }], error: null });
  const out = await makeStore(client).insert('tags', { name: 'Moradia' });
  assert.equal(out[0].id, 'x');
  assert.deepEqual(ops(client.calls[0]), [['insert', [{ name: 'Moradia' }]], ['select']]);
});

test('update e remove filtram pelo id', async () => {
  const client = fakeClient({ data: [{ id: 'x' }], error: null });
  const s = makeStore(client);
  await s.update('transactions', 'x', { amount_cents: 5 });
  await s.remove('transactions', 'x');
  assert.deepEqual(ops(client.calls[0]), [['update', { amount_cents: 5 }], ['eq', 'id', 'x'], ['select']]);
  assert.deepEqual(ops(client.calls[1]), [['delete'], ['eq', 'id', 'x']]);
});

test('removeWhere exclui todas as parcelas do grupo', async () => {
  const client = fakeClient({ data: null, error: null });
  await makeStore(client).removeWhere('transactions', { installment_group: 'g1' });
  assert.deepEqual(ops(client.calls[0]), [['delete'], ['eq', 'installment_group', 'g1']]);
});

test('alterar dado de outra pessoa vira mensagem em português', async () => {
  const client = fakeClient({ data: [], error: { message: 'new row violates row-level security policy for table "transactions"' } });
  await assert.rejects(makeStore(client).insert('transactions', {}), /só pode alterar os seus próprios dados/);
});

test('update que não atinge nenhuma linha avisa que não é permitido', async () => {
  const client = fakeClient({ data: [], error: null });
  await assert.rejects(makeStore(client).update('transactions', 'x', { amount_cents: 1 }), /só pode alterar os seus próprios dados/);
});

test('erro de rede vira mensagem em português', async () => {
  const client = fakeClient({ data: null, error: { message: 'Failed to fetch' } });
  await assert.rejects(makeStore(client).list('tags'), /Sem conexão/);
});

test('senha errada vira "E-mail ou senha incorretos."', async () => {
  const client = fakeClient(undefined, { signIn: async () => ({ data: {}, error: { message: 'Invalid login credentials' } }) });
  await assert.rejects(makeStore(client).signIn('a@b.com', 'x'), /E-mail ou senha incorretos\./);
});

test('login certo guarda o usuário atual', async () => {
  const s = makeStore(fakeClient());
  assert.equal(s.currentUser(), null);
  const u = await s.signIn('a@b.com', 'certa');
  assert.equal(u.id, 'u1');
  assert.equal(s.currentUser().id, 'u1');
  await s.signOut();
  assert.equal(s.currentUser(), null);
});

test('restoreSession recupera a sessão salva no navegador', async () => {
  const s = makeStore(fakeClient(undefined, { session: { user: { id: 'u9' } } }));
  const u = await s.restoreSession();
  assert.equal(u.id, 'u9');
});

test('list busca em páginas de 1000 até acabar (anos de histórico)', async () => {
  const total = 2500;
  const client = fakeClient((chain) => {
    const r = chain.ops.find((o) => o[0] === 'range');
    const from = r ? r[1] : 0, to = r ? r[2] : 999;
    const n = Math.max(0, Math.min(to, total - 1) - from + 1);
    return { data: Array.from({ length: n }, (_, i) => ({ id: from + i })), error: null };
  });
  const rows = await makeStore(client).list('transactions');
  assert.equal(rows.length, 2500);
  assert.equal(client.calls.length, 3);
  assert.deepEqual(ops(client.calls[1]).at(-1), ['range', 1000, 1999]);
});

test('tipo que o banco ainda não aceita pede para rodar a atualização', async () => {
  const client = fakeClient({ data: null, error: { message: 'new row for relation "transactions" violates check constraint "transactions_kind_check"' } });
  await assert.rejects(makeStore(client).insert('transactions', {}), /migracao-002-doacoes\.sql/);
});

test('coluna extraordinário ausente pede para rodar a atualização 003', async () => {
  const client = fakeClient({ data: null, error: { message: "Could not find the 'extraordinario' column of 'transactions' in the schema cache" } });
  await assert.rejects(makeStore(client).insert('transactions', {}), /migracao-003-extraordinario-excluir-tags\.sql/);
});

test('coluna de extraordinário parcial ausente pede para rodar a atualização 004', async () => {
  const client = fakeClient({ data: null, error: { message: "Could not find the 'extraordinario_cents' column of 'transactions' in the schema cache" } });
  await assert.rejects(makeStore(client).insert('transactions', {}), /migracao-004-extraordinario-parcial\.sql/);
});

test('upsert grava a configuração e devolve a linha', async () => {
  const client = fakeClient({ data: [{ owner_id: 'u1', hora: '07:30:00' }], error: null });
  const r = await makeStore(client).upsert('lembrete_config', { owner_id: 'u1', hora: '07:30' });
  assert.equal(r.hora, '07:30:00');
  assert.deepEqual(ops(client.calls[0]), [['upsert', { owner_id: 'u1', hora: '07:30' }], ['select']]);
});

test('tabelas do lembrete ausentes pedem para rodar a atualização 006', async () => {
  const client = fakeClient({ data: null, error: { message: "Could not find the table 'public.lembrete_config' in the schema cache" } });
  await assert.rejects(makeStore(client).list('lembrete_config'), /migracao-006-lembrete-diario\.sql/);
});

test('rpc e função do Supabase: erro da função chega em português', async () => {
  const client = fakeClient();
  client.rpc = async (nome, args) => ({ data: [nome, args], error: null });
  client.functions = { invoke: async (nome, op) => (op.method === 'GET'
    ? { data: { chave: 'abc' }, error: null }
    : { data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status: 409, json: async () => ({ erro: 'Ative as notificações neste aparelho primeiro.' }) } } }) };
  const s = makeStore(client);
  assert.deepEqual(JSON.parse(JSON.stringify(await s.rpc('registrar_inscricao', { p_endpoint: 'e' }))), ['registrar_inscricao', { p_endpoint: 'e' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(await s.invokeFunction('lembrete-diario', { method: 'GET' }))), { chave: 'abc' });
  await assert.rejects(s.invokeFunction('lembrete-diario', { body: { acao: 'teste' } }), /Ative as notificações neste aparelho primeiro\./);
  client.functions.invoke = async () => ({ data: null, error: { message: 'x', context: { status: 404, json: async () => ({}) } } });
  await assert.rejects(s.invokeFunction('lembrete-diario', {}), /ainda não está no Supabase/);
});

test('list da configuração do lembrete ordena pela chave dela (não tem coluna id)', async () => {
  const client = fakeClient({ data: [], error: null });
  await makeStore(client).list('lembrete_config');
  assert.deepEqual(ops(client.calls[0]), [['select', '*'], ['order', 'owner_id'], ['range', 0, 999]]);
});

test('coluna que não existe não é confundida com a migração 006 faltando', async () => {
  const client = fakeClient({ data: null, error: { message: 'column lembrete_config.id does not exist' } });
  await assert.rejects(makeStore(client).list('frases'), (e) => !/migracao-006/.test(e.message));
});
