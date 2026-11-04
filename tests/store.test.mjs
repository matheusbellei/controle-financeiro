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
