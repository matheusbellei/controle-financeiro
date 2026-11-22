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
    icon: './icone-192.png',
    badge: './icone-192.png',
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
