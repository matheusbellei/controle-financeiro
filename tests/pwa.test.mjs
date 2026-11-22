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
  assert.equal(op.icon, './icone-192.png');
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
