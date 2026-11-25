// Service worker do app instalável (PWA).
// - A página (index.html) vem sempre da internet primeiro, para pegar a versão nova; sem internet, usa a cópia guardada.
// - Ícones, fontes e bibliotecas (CDN) vêm da cópia guardada, e são atualizados em segundo plano.
// - Dados do Supabase e envios (POST, PATCH...) nunca passam pelo cache.
// - Mostra o lembrete diário (notificação push) e abre o app quando a pessoa toca nele.
const CACHE = 'financas-v1';
const ESSENCIAIS = ['./', './index.html', './manifest.json', './icone-192.png', './icone-512.png'];

function estrategia(req, origem) {
  const url = new URL(req.url);
  if (req.method !== 'GET') return 'ignorar';
  if (url.hostname.endsWith('supabase.co')) return 'ignorar';
  if (req.mode === 'navigate') return 'rede-primeiro';
  if (url.origin === origem && (url.pathname.endsWith('/') || url.pathname.endsWith('.html'))) return 'rede-primeiro';
  return 'cache-primeiro';
}

async function redePrimeiro(req) {
  const cache = await caches.open(CACHE);
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (e) {
    return (await cache.match(req)) || (await cache.match('./index.html')) || Response.error();
  }
}

async function cachePrimeiro(req) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(req);
  const buscar = fetch(req).then((resp) => {
    if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
    return resp;
  }).catch(() => guardada);
  return guardada || buscar;
}

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const tipo = estrategia(ev.request, self.location && self.location.origin);
  if (tipo === 'rede-primeiro') ev.respondWith(redePrimeiro(ev.request));
  else if (tipo === 'cache-primeiro') ev.respondWith(cachePrimeiro(ev.request));
});

// ---------- lembrete diário (push) ----------
self.addEventListener('push', (ev) => {
  let d = {};
  try { d = (ev.data && ev.data.json()) || {}; } catch (e) { d = { corpo: ev.data ? ev.data.text() : '' }; }
  ev.waitUntil(self.registration.showNotification(d.titulo || 'Finanças pessoais', {
    body: d.corpo || 'Hora de lançar os gastos do dia.',
    // Sem "icon": o Android já mostra o ícone do app (com ele, o logo aparecia duas vezes) e o iPhone ignora.
    badge: './icone-notificacao.png', // barra de status do Android: forma branca em fundo transparente
    tag: 'lembrete-diario',
    renotify: true,
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const escopo = self.registration.scope;
  const alvo = new URL((ev.notification.data && ev.notification.data.url) || './', escopo).href;
  ev.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
    const aberta = janelas.find((j) => j.url.startsWith(escopo) && 'focus' in j);
    return aberta ? aberta.focus() : clients.openWindow(alvo);
  }));
});

// ---------- inscrição trocada pelo navegador (segundo plano, sem abrir o app) ----------
// O Chrome às vezes renova a inscrição do aparelho e avisa aqui. O service worker cria/pega a nova e pede à
// função que troque o endereço antigo pelo novo (o antigo é a prova; não precisa de login).
// O app guarda o último endereço registrado neste cofre, para quando o navegador não informa o antigo.
const FUNCAO_LEMBRETE = 'https://qtgkpnejimlrkjdhrqfh.supabase.co/functions/v1/lembrete-diario';
const COFRE = 'financas-inscricao';
const CHAVE_COFRE = './__inscricao';

async function lerGuardado() {
  try { const r = await (await caches.open(COFRE)).match(CHAVE_COFRE); return r ? await r.json() : {}; } catch (e) { return {}; }
}
async function guardar(endpoint) {
  try { await (await caches.open(COFRE)).put(CHAVE_COFRE, new Response(JSON.stringify({ endpoint }))); } catch (e) { /* ignora */ }
}

async function trocarInscricao(ev) {
  const antigo = (ev.oldSubscription && ev.oldSubscription.endpoint) || (await lerGuardado()).endpoint;
  if (!antigo) return;
  let nova = ev.newSubscription || await self.registration.pushManager.getSubscription();
  if (!nova) {
    const { chave } = await (await fetch(FUNCAO_LEMBRETE)).json();
    if (!chave) return;
    nova = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
  }
  const j = nova.toJSON();
  if (j.endpoint === antigo) return;
  const r = await fetch(FUNCAO_LEMBRETE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'trocar', antigo, nova: { endpoint: j.endpoint, keys: j.keys } }),
  });
  if (r.ok) await guardar(j.endpoint);
}

self.addEventListener('pushsubscriptionchange', (ev) => {
  ev.waitUntil(trocarInscricao(ev).catch(() => { /* sem rede: o app se reconecta ao abrir */ }));
});
