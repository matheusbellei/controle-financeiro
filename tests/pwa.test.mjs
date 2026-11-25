import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('../', import.meta.url);
const ler = (f) => readFileSync(new URL(f, raiz));
// Largura e altura de um PNG (bytes 16 a 23 do cabeçalho IHDR).
const tamanhoPng = (f) => { const b = ler(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('manifesto tem nome, cores, início e ícones para instalar', () => {
  const m = JSON.parse(ler('manifest.json'));
  assert.equal(m.name, 'Controle de Finanças Pessoais');
  assert.equal(m.short_name, 'Finanças pessoais');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.theme_color, '#3B2416');
  assert.equal(m.background_color, '#F5EBDD');
  const tamanhos = m.icons.map((i) => i.sizes);
  assert.ok(tamanhos.includes('192x192') && tamanhos.includes('512x512'));
  assert.ok(m.icons.some((i) => (i.purpose || '').includes('maskable')));
  for (const i of m.icons) {
    assert.ok(existsSync(new URL(i.src, raiz)), `falta ${i.src}`);
    assert.deepEqual(tamanhoPng(i.src).join('x'), i.sizes);
  }
});

test('ícone do iPhone existe com 180x180', () => {
  assert.deepEqual(tamanhoPng('icone-180.png'), [180, 180]);
});

test('index.html aponta para o manifesto e o ícone do iPhone', () => {
  const html = ler('index.html').toString();
  assert.match(html, /<link rel="manifest" href="manifest\.json">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icone-180\.png">/);
  assert.match(html, /navigator\.serviceWorker\.register\('sw\.js'\)/);
});

test('service worker: dados do Supabase e envios nunca vêm do cache', () => {
  const ctx = { self: { addEventListener() {} }, caches: {}, fetch() {}, URL, Promise, Response: class {} };
  vm.createContext(ctx);
  vm.runInContext(ler('sw.js').toString(), ctx);
  const origem = 'https://matheusbellei.github.io';
  const d = (url, method = 'GET', mode = 'cors') => ctx.estrategia({ url, method, mode }, origem);
  assert.equal(d('https://qtgkpnejimlrkjdhrqfh.supabase.co/rest/v1/transactions'), 'ignorar');
  assert.equal(d('https://qtgkpnejimlrkjdhrqfh.supabase.co/auth/v1/token', 'POST'), 'ignorar');
  assert.equal(d(`${origem}/controle-financeiro/`, 'GET', 'navigate'), 'rede-primeiro');
  assert.equal(d(`${origem}/controle-financeiro/index.html`), 'rede-primeiro');
  assert.equal(d(`${origem}/controle-financeiro/icone-192.png`), 'cache-primeiro');
  assert.equal(d('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'), 'cache-primeiro');
  assert.equal(d('https://fonts.gstatic.com/s/inter/v1.woff2'), 'cache-primeiro');
});

// Roda o sw.js num contexto falso e devolve os eventos registrados.
function swFalso({ janelas = [] } = {}) {
  const eventos = {}; const mostradas = []; const abertas = []; const focadas = [];
  const ctx = {
    URL, Promise, Response: class {}, caches: {}, fetch() {},
    self: {
      addEventListener: (nome, fn) => { eventos[nome] = fn; },
      registration: { scope: 'https://matheusbellei.github.io/controle-financeiro/', showNotification: (t, o) => { mostradas.push([t, o]); return Promise.resolve(); } },
    },
    clients: {
      matchAll: async () => janelas.map((url) => ({ url, focus: async () => { focadas.push(url); } })),
      openWindow: async (url) => { abertas.push(url); },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(ler('sw.js').toString(), ctx);
  const disparar = async (nome, ev) => { let p; ev.waitUntil = (x) => { p = x; }; eventos[nome](ev); await p; };
  return { disparar, mostradas, abertas, focadas };
}

test('service worker: notificação de push aparece com título, texto e ícone', async () => {
  const sw = swFalso();
  await sw.disparar('push', { data: { json: () => ({ titulo: 'Hora de lançar os gastos', corpo: 'Leva um minuto.\n\n“Frase” — Autor', url: './' }) } });
  assert.equal(sw.mostradas.length, 1);
  const [titulo, op] = sw.mostradas[0];
  assert.equal(titulo, 'Hora de lançar os gastos');
  assert.equal(op.body, 'Leva um minuto.\n\n“Frase” — Autor');
  assert.equal(op.icon, undefined, 'o Android já mostra o ícone do app; imagem extra duplica o logo');
  assert.equal(op.badge, './icone-notificacao.png');
  assert.equal(op.tag, 'lembrete-diario');
});

test('service worker: push sem conteúdo ainda mostra um aviso', async () => {
  const sw = swFalso();
  await sw.disparar('push', { data: null });
  assert.equal(sw.mostradas[0][0], 'Finanças pessoais');
});

test('service worker: tocar na notificação abre o app, ou traz a janela aberta para frente', async () => {
  const fechar = () => {};
  const sw1 = swFalso();
  await sw1.disparar('notificationclick', { notification: { close: fechar, data: { url: './' } } });
  assert.deepEqual(sw1.abertas, ['https://matheusbellei.github.io/controle-financeiro/']);
  const sw2 = swFalso({ janelas: ['https://matheusbellei.github.io/controle-financeiro/index.html'] });
  await sw2.disparar('notificationclick', { notification: { close: fechar, data: {} } });
  assert.deepEqual(sw2.abertas, []);
  assert.deepEqual(sw2.focadas, ['https://matheusbellei.github.io/controle-financeiro/index.html']);
});

test('ícone da barra de status: branco sobre fundo transparente, como o Android exige', () => {
  const png = ler('icone-notificacao.png');
  assert.equal(png.readUInt32BE(16), 96); // largura
  assert.equal(png.readUInt32BE(20), 96); // altura
  assert.equal(png[25], 6, 'PNG com transparência (RGBA)');
});

// Service worker com cofre (Cache Storage), rede e pushManager falsos, para a troca de inscrição.
function swTroca({ salvo = null, atual = null, respostaTroca = 200 } = {}) {
  const eventos = {}; const pedidos = []; const guardado = { v: salvo }; const inscritas = [];
  const sub = (endpoint) => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'BNova', auth: 'aNova' } }) });
  const ctx = {
    URL, Promise, JSON, Response: class { constructor(b, o = {}) { this.b = b; this.status = o.status || 200; this.ok = this.status < 300; } async json() { return JSON.parse(this.b); } },
    caches: { open: async () => ({
      match: async () => (guardado.v ? { json: async () => guardado.v } : undefined),
      put: async (_k, r) => { guardado.v = JSON.parse(r.b); },
    }) },
    fetch: async (url, op = {}) => {
      pedidos.push({ url: String(url), metodo: op.method || 'GET', corpo: op.body && JSON.parse(op.body) });
      if (!op.method || op.method === 'GET') return new ctx.Response(JSON.stringify({ chave: 'BChavePublica' }));
      return new ctx.Response('{}', { status: respostaTroca });
    },
    self: {
      addEventListener: (nome, fn) => { eventos[nome] = fn; },
      registration: { scope: 'https://x/', showNotification: async () => {},
        pushManager: { getSubscription: async () => (atual ? sub(atual) : null),
          subscribe: async (op) => { inscritas.push(op); return sub('https://fcm.googleapis.com/criada-no-sw'); } } },
    },
    clients: { matchAll: async () => [], openWindow: async () => {} },
  };
  vm.createContext(ctx);
  vm.runInContext(ler('sw.js').toString(), ctx);
  const disparar = async (ev) => { let p; ev.waitUntil = (x) => { p = x; }; eventos.pushsubscriptionchange(ev); await p; };
  return { disparar, pedidos, guardado, inscritas };
}
const FUNCAO = 'https://qtgkpnejimlrkjdhrqfh.supabase.co/functions/v1/lembrete-diario';

test('service worker: inscrição trocada pelo navegador é avisada à função, sem login', async () => {
  const sw = swTroca();
  await sw.disparar({ oldSubscription: { endpoint: 'https://fcm.googleapis.com/velho' },
    newSubscription: { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/novo', keys: { p256dh: 'BNova', auth: 'aNova' } }) } });
  const p = sw.pedidos.find((x) => x.metodo === 'POST');
  assert.equal(p.url, FUNCAO);
  assert.deepEqual(p.corpo, { acao: 'trocar', antigo: 'https://fcm.googleapis.com/velho',
    nova: { endpoint: 'https://fcm.googleapis.com/novo', keys: { p256dh: 'BNova', auth: 'aNova' } } });
  assert.deepEqual(sw.guardado.v, { endpoint: 'https://fcm.googleapis.com/novo' }, 'guarda o novo para a próxima troca');
});

test('service worker: sem a inscrição antiga no evento, usa a guardada; sem a nova, cria uma com a chave da função', async () => {
  const sw = swTroca({ salvo: { endpoint: 'https://fcm.googleapis.com/guardado' } });
  await sw.disparar({ oldSubscription: null, newSubscription: null });
  assert.deepEqual(JSON.parse(JSON.stringify(sw.inscritas)), [{ userVisibleOnly: true, applicationServerKey: 'BChavePublica' }]);
  const p = sw.pedidos.find((x) => x.metodo === 'POST');
  assert.equal(p.corpo.antigo, 'https://fcm.googleapis.com/guardado');
  assert.equal(p.corpo.nova.endpoint, 'https://fcm.googleapis.com/criada-no-sw');
});

test('service worker: sem saber o endereço antigo, ou se nada mudou, não chama a função', async () => {
  const sw1 = swTroca();
  await sw1.disparar({ oldSubscription: null, newSubscription: null });
  assert.equal(sw1.pedidos.length, 0);
  const sw2 = swTroca({ salvo: { endpoint: 'https://fcm.googleapis.com/igual' }, atual: 'https://fcm.googleapis.com/igual' });
  await sw2.disparar({ oldSubscription: null, newSubscription: null });
  assert.equal(sw2.pedidos.filter((x) => x.metodo === 'POST').length, 0);
});
