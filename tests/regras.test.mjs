import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRules } from './load-rules.mjs';

const R = loadRules();
const deq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
const plain = (s) => s.replace(/\u00a0/g, ' ');

test('crédito conta no dia 10 do mês seguinte', () => {
  assert.equal(R.competenceDate('2026-10-28', 'credito'), '2026-11-10');
  assert.equal(R.competenceDate('2026-11-01', 'credito'), '2026-12-10');
});
test('crédito em dezembro vira 10 de janeiro do ano seguinte', () => {
  assert.equal(R.competenceDate('2026-12-31', 'credito'), '2027-01-10');
});
test('pix, débito e dinheiro contam na própria data', () => {
  for (const p of ['pix', 'debito', 'dinheiro', null]) assert.equal(R.competenceDate('2026-10-28', p), '2026-10-28');
});

test('parcelado: centavos que sobram vão na primeira parcela', () => {
  const p = R.splitInstallments(10000, 3, '2026-10-28');
  deq(p.map((x) => x.amount_cents), [3334, 3333, 3333]);
  deq(p.map((x) => x.competence_date), ['2026-11-10', '2026-12-10', '2027-01-10']);
  deq(p.map((x) => [x.installment_n, x.installment_total]), [[1, 3], [2, 3], [3, 3]]);
});
test('parcelado: a soma sempre fecha o total', () => {
  const p = R.splitInstallments(99999, 7, '2026-05-15');
  assert.equal(p.reduce((s, x) => s + x.amount_cents, 0), 99999);
});
test('parcelado em 12x a partir de maio atravessa a virada do ano', () => {
  const p = R.splitInstallments(120000, 12, '2026-05-20');
  assert.equal(p[0].competence_date, '2026-06-10');
  assert.equal(p[11].competence_date, '2027-05-10');
});
test('parcela única no crédito é igual a compra comum', () => {
  const p = R.splitInstallments(80000, 1, '2026-11-05');
  assert.equal(p.length, 1);
  assert.equal(p[0].competence_date, '2026-12-10');
});

test('recorrente no dia 31 cai no último dia de fevereiro', () => {
  assert.equal(R.recurrenceDateFor({ day_of_month: 31, payment: 'pix' }, '2026-02-01'), '2026-02-28');
  assert.equal(R.recurrenceDateFor({ day_of_month: 31, payment: 'pix' }, '2028-02-01'), '2028-02-29');
});
test('recorrente no crédito segue a regra do dia 10', () => {
  assert.equal(R.recurrenceDateFor({ day_of_month: 5, payment: 'credito' }, '2026-11-01'), '2026-12-10');
});

const rec = { id: 'r1', owner_id: 'u1', kind: 'gasto', amount_cents: 80000, description: 'Aluguel', tag_id: 't1',
  payment: 'pix', day_of_month: 5, start_month: '2026-01-01', end_month: null, paused: false };
test('recorrente pendente gera um lançamento no mês', () => {
  const out = R.pendingRecurrences([rec], [], '2026-11-01');
  assert.equal(out.length, 1);
  assert.equal(out[0].competence_date, '2026-11-05');
  assert.equal(out[0].purchase_date, '2026-11-05');
  assert.equal(out[0].recurrence_id, 'r1');
  assert.equal(out[0].amount_cents, 80000);
  assert.equal(out[0].tag_id, 't1');
});
test('abrir o mês duas vezes não duplica o recorrente', () => {
  const first = R.pendingRecurrences([rec], [], '2026-11-01');
  deq(R.pendingRecurrences([rec], first, '2026-11-01'), []);
});
test('recorrente pausado, encerrado ou ainda não iniciado não gera nada', () => {
  deq(R.pendingRecurrences([{ ...rec, paused: true }], [], '2026-11-01'), []);
  deq(R.pendingRecurrences([{ ...rec, end_month: '2026-10-01' }], [], '2026-11-01'), []);
  deq(R.pendingRecurrences([{ ...rec, start_month: '2026-12-01' }], [], '2026-11-01'), []);
});
test('recorrente no crédito comprado em novembro entra no mês de dezembro', () => {
  const c = { ...rec, payment: 'credito', start_month: '2026-11-01' };
  deq(R.pendingRecurrences([c], [], '2026-11-01'), []);
  const dez = R.pendingRecurrences([c], [], '2026-12-01');
  assert.equal(dez[0].purchase_date, '2026-11-05');
  assert.equal(dez[0].competence_date, '2026-12-10');
});

test('resumo do mês: livre = receitas − gastos − investido', () => {
  const s = R.monthSummary([
    { kind: 'receita', amount_cents: 600000 }, { kind: 'gasto', amount_cents: 387000 },
    { kind: 'investimento', amount_cents: 80000 }]);
  deq({ ...s }, { receitas: 600000, gastos: 387000, investido: 80000, doacoes: 0, livre: 133000 });
});
test('estorno (gasto negativo) reduz o total gasto', () => {
  const s = R.monthSummary([{ kind: 'gasto', amount_cents: 10000 }, { kind: 'gasto', amount_cents: -3000 }]);
  assert.equal(s.gastos, 7000);
});

const tags = [{ id: 'ali', parent_id: null }, { id: 'mer', parent_id: 'ali' }, { id: 'lazer', parent_id: null }];
test('subtag soma na tag-mãe e investimento fica fora', () => {
  assert.equal(R.rootTagId('mer', tags), 'ali');
  const m = R.totalsByRootTag([
    { kind: 'gasto', amount_cents: 500, tag_id: 'mer' }, { kind: 'gasto', amount_cents: 200, tag_id: 'ali' },
    { kind: 'investimento', amount_cents: 9999, tag_id: 'lazer' }, { kind: 'gasto', amount_cents: 50, tag_id: 'lazer' }], tags);
  assert.equal(m.get('ali'), 700);
  assert.equal(m.get('lazer'), 50);
});
test('gasto sem tag aparece como "sem-tag"', () => {
  const m = R.totalsByRootTag([{ kind: 'gasto', amount_cents: 300, tag_id: null }], tags);
  assert.equal(m.get('sem-tag'), 300);
});

test('orçamento: atenção a partir de 80%, estourou acima de 100%', () => {
  assert.equal(R.budgetStatus(799, 1000), 'ok');
  assert.equal(R.budgetStatus(800, 1000), 'atencao');
  assert.equal(R.budgetStatus(1000, 1000), 'atencao');
  assert.equal(R.budgetStatus(1001, 1000), 'estourou');
});

test('série mensal do ano soma por competência', () => {
  const s = R.monthlySeries([
    { kind: 'receita', amount_cents: 100, competence_date: '2026-01-05' },
    { kind: 'gasto', amount_cents: 40, competence_date: '2026-01-20' },
    { kind: 'investimento', amount_cents: 10, competence_date: '2026-03-01' },
    { kind: 'gasto', amount_cents: 999, competence_date: '2025-12-01' }], 2026);
  assert.equal(s.length, 12);
  deq({ ...s[0] }, { mes: 1, receitas: 100, gastos: 40, investido: 0, doacoes: 0 });
  assert.equal(s[2].investido, 10);
});

test('formatos brasileiros de moeda e data', () => {
  assert.equal(plain(R.formatBRL(4890)), 'R$ 48,90');
  assert.equal(plain(R.formatBRL(-123456)), '-R$ 1.234,56');
  assert.equal(R.formatDateBR('2026-11-02'), '02/11/2026');
});
test('valor digitado em reais vira centavos', () => {
  assert.equal(R.parseBRL('48,90'), 4890);
  assert.equal(R.parseBRL('1.234,5'), 123450);
  assert.equal(R.parseBRL('800'), 80000);
  assert.equal(R.parseBRL(''), null);
  assert.equal(R.parseBRL('abc'), null);
});

test('recorrente já lançado no mês, com data editada, não é criado de novo', () => {
  const editado = [{ recurrence_id: 'r1', competence_date: '2026-11-07' }];
  deq(R.pendingRecurrences([rec], editado, '2026-11-01'), []);
  deq(R.pendingRecurrences([{ ...rec, day_of_month: 10 }], editado, '2026-11-01'), []);
});
test('recorrente não é gerado em meses futuros (só até o mês atual)', () => {
  deq(R.pendingRecurrences([rec], [], '2027-01-01', '2026-11-01'), []);
  assert.equal(R.pendingRecurrences([rec], [], '2026-11-01', '2026-11-01').length, 1);
  const c = { ...rec, payment: 'credito' };
  assert.equal(R.pendingRecurrences([c], [], '2026-12-01', '2026-11-01').length, 1, 'crédito comprado em novembro já aparece em dezembro');
  deq(R.pendingRecurrences([c], [], '2027-01-01', '2026-11-01'), []);
});
test('valor com ponto decimal (teclado do celular) não vira 100x', () => {
  assert.equal(R.parseBRL('48.90'), 4890);
  assert.equal(R.parseBRL('48.9'), 4890);
  assert.equal(R.parseBRL('1.234'), 123400);
  assert.equal(R.parseBRL('1.234.567'), 123456700);
  assert.equal(R.parseBRL('1.234,56'), 123456);
});

test('primeiro nome a partir do nome ou do e-mail', () => {
  assert.equal(R.primeiroNome('denise.teixeira249@gmail.com'), 'Denise');
  assert.equal(R.primeiroNome('denise.teixeira249'), 'Denise');
  assert.equal(R.primeiroNome('Denise Teixeira'), 'Denise');
  assert.equal(R.primeiroNome('MATHEUS BELLEI'), 'Matheus');
  assert.equal(R.primeiroNome('mterra3500@gmail.com'), 'Mterra');
  assert.equal(R.primeiroNome(''), '');
});

test('doação sai do saldo livre e fica separada dos gastos', () => {
  const s = R.monthSummary([{ kind: 'receita', amount_cents: 10000 }, { kind: 'gasto', amount_cents: 2000 },
    { kind: 'investimento', amount_cents: 1000 }, { kind: 'doacao', amount_cents: 500 }]);
  assert.deepEqual({ ...s }, { receitas: 10000, gastos: 2000, investido: 1000, doacoes: 500, livre: 6500 });
});
test('doação não entra no gasto por tag', () => {
  const m = R.totalsByRootTag([{ kind: 'doacao', amount_cents: 500, tag_id: 'x' }], []);
  assert.equal(m.size, 0);
});
test('série mensal inclui doações', () => {
  const s = R.monthlySeries([{ kind: 'doacao', amount_cents: 700, competence_date: '2026-02-01' }], 2026);
  assert.equal(s[1].doacoes, 700);
});

test('escala dos gráficos começa de R$ 300 em R$ 300 e cresce com os valores', () => {
  deq(R.escalaEixo(0), { step: 300, max: 1500 });
  deq(R.escalaEixo(1000), { step: 300, max: 1500 });
  deq(R.escalaEixo(1700), { step: 300, max: 1800 });
  deq(R.escalaEixo(2000), { step: 600, max: 2400 });
  deq(R.escalaEixo(9000), { step: 1500, max: 9000 });
  deq(R.escalaEixo(25000), { step: 6000, max: 30000 });
});

test('comparativo entre anos: total por ano, ou o mesmo mês em cada ano', () => {
  const txs = [{ kind: 'gasto', amount_cents: 100, competence_date: '2025-11-03' },
    { kind: 'gasto', amount_cents: 50, competence_date: '2025-02-03' },
    { kind: 'gasto', amount_cents: 300, competence_date: '2026-11-10' },
    { kind: 'receita', amount_cents: 999, competence_date: '2026-11-10' }];
  deq(R.gastosPorAno(txs, [2025, 2026], null), [150, 300]);
  deq(R.gastosPorAno(txs, [2025, 2026], 11), [100, 300]);
});

test('somar meses mantém o dia (limitado ao fim do mês)', () => {
  assert.equal(R.addMonthsDay('2026-11-25', 1), '2026-12-25');
  assert.equal(R.addMonthsDay('2026-12-25', 1), '2027-01-25');
  assert.equal(R.addMonthsDay('2026-01-31', 1), '2026-02-28');
  assert.equal(R.addMonthsDay('2026-03-31', -1), '2026-02-28');
});
test('parcelado com data da fatura escolhida: uma parcela por mês a partir dela', () => {
  const p = R.splitInstallments(10000, 3, '2026-10-28', '2026-11-25');
  deq(p.map((x) => x.competence_date), ['2026-11-25', '2026-12-25', '2027-01-25']);
  deq(p.map((x) => x.amount_cents), [3334, 3333, 3333]);
});
test('sem data escolhida, continua no dia 10 do mês seguinte', () => {
  deq(R.splitInstallments(10000, 2, '2026-10-28').map((x) => x.competence_date), ['2026-11-10', '2026-12-10']);
});
test('soma de valores por ano para qualquer medida', () => {
  const txs = [{ kind: 'receita', amount_cents: 1000, competence_date: '2025-11-01' },
    { kind: 'gasto', amount_cents: 300, competence_date: '2025-11-02' },
    { kind: 'doacao', amount_cents: 100, competence_date: '2026-11-02' },
    { kind: 'receita', amount_cents: 500, competence_date: '2026-03-02' }];
  deq(R.valoresPorAno(txs, [2025, 2026], null, 'receitas'), [1000, 500]);
  deq(R.valoresPorAno(txs, [2025, 2026], 11, 'receitas'), [1000, 0]);
  deq(R.valoresPorAno(txs, [2025, 2026], null, 'livre'), [700, 400]);
  deq(R.valoresPorAno(txs, [2026], 11, 'doacoes'), [100]);
});
test('acumulado mês a mês', () => {
  deq(R.acumular([1, 2, 0, 5]), [1, 3, 3, 8]);
});
