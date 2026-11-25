// @ts-nocheck — código em JavaScript puro (sem tipos), para rodar igual no Supabase (Deno) e nos testes (Node).
// Edge Function "lembrete-diario" — envia o lembrete diário por notificação (Web Push).
//
// Quem chama:
//   • O agendamento do banco (pg_cron), a cada 15 minutos, com o cabeçalho x-lembrete-segredo.
//     A função pergunta ao banco quem deve ser avisado agora (lembretes_devidos) e envia.
//   • O app, no botão "Enviar teste agora", com o login da pessoa: envia só para os aparelhos dela.
//   • O app, para pegar a chave pública de notificação (GET).
//   • O service worker do celular, em segundo plano, quando o navegador troca a inscrição do aparelho
//     ({acao:'trocar', antigo, nova}). O endereço antigo é a prova: só quem o tinha consegue trocá-lo.
//
// Segredos (Edge Functions → Secrets no painel do Supabase):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:seu-email) e LEMBRETE_SEGREDO.
// SUPABASE_URL e as chaves do projeto o próprio Supabase fornece.
//
// Sem bibliotecas externas: a criptografia do Web Push (RFC 8291 + RFC 8188) e a assinatura VAPID
// (RFC 8292) usam só o WebCrypto. Configure a função com "Verify JWT" DESLIGADO: ela confere sozinha
// o segredo do agendamento e o login da pessoa.

const enc = new TextEncoder();
const subtle = globalThis.crypto.subtle;

// ---------- base64url ----------
export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function deb64url(texto) {
  const t = String(texto).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function juntar(...partes) {
  const r = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { r.set(p, i); i += p.length; }
  return r;
}
async function hmac(chave, dados) {
  const k = await subtle.importKey('raw', chave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', k, dados));
}
function jwkDaChave(d, publica) {
  return { kty: 'EC', crv: 'P-256', d, x: b64url(publica.slice(1, 33)), y: b64url(publica.slice(33, 65)), ext: true };
}

// ---------- criptografia do conteúdo (aes128gcm) ----------
// opcoes.salt e opcoes.remetente só existem para conferir com o exemplo do RFC; no uso normal são aleatórios.
export async function criptografar(conteudo, inscricao, opcoes = {}) {
  const uaPub = deb64url(inscricao.p256dh);
  const authSecret = deb64url(inscricao.auth);
  const salt = opcoes.salt || globalThis.crypto.getRandomValues(new Uint8Array(16));

  let asPriv, asPub;
  if (opcoes.remetente) {
    asPub = deb64url(opcoes.remetente.publica);
    asPriv = await subtle.importKey('jwk', jwkDaChave(opcoes.remetente.d, asPub), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const par = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asPriv = par.privateKey;
    asPub = new Uint8Array(await subtle.exportKey('raw', par.publicKey));
  }
  const uaKey = await subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPriv, 256));

  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, juntar(enc.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, juntar(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, juntar(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const chave = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, chave, juntar(conteudo, new Uint8Array([2]))));

  const cabecalho = new Uint8Array(21);
  cabecalho.set(salt, 0);
  new DataView(cabecalho.buffer).setUint32(16, 4096);
  cabecalho[20] = asPub.length;
  return juntar(cabecalho, asPub, cifrado);
}

// ---------- assinatura VAPID (JWT ES256) ----------
export async function jwtVapid({ aud, sub, publica, privada, agora = Math.floor(Date.now() / 1000) }) {
  const cab = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const carga = b64url(enc.encode(JSON.stringify({ aud, exp: agora + 12 * 3600, sub })));
  const chave = await subtle.importKey('jwk', jwkDaChave(privada, deb64url(publica)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const assinatura = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave, enc.encode(`${cab}.${carga}`)));
  return `${cab}.${carga}.${b64url(assinatura)}`;
}

async function enviarPush(linha, vapid, fetchFn) {
  const conteudo = enc.encode(JSON.stringify({ titulo: linha.titulo, corpo: linha.corpo, url: './' }));
  const corpo = await criptografar(conteudo, linha);
  const jwt = await jwtVapid({ aud: new URL(linha.endpoint).origin, sub: vapid.sub, publica: vapid.publica, privada: vapid.privada });
  const resp = await fetchFn(linha.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '43200',            // se o celular estiver desligado, tenta entregar por até 12 horas
      Urgency: 'normal',
      Topic: 'lembrete-diario', // um lembrete novo substitui o anterior ainda não entregue
      Authorization: `vapid t=${jwt}, k=${vapid.publica}`,
    },
    body: corpo,
  });
  return resp.status;
}

// ---------- acesso ao banco (PostgREST) com a chave secreta do projeto ----------
function primeiraChave(json) {
  try { const o = JSON.parse(json || ''); return o.default || Object.values(o)[0] || ''; } catch { return ''; }
}
function chaves(env) {
  const secreta = primeiraChave(env('SUPABASE_SECRET_KEYS')) || env('SUPABASE_SERVICE_ROLE_KEY') || '';
  const publica = primeiraChave(env('SUPABASE_PUBLISHABLE_KEYS')) || env('SUPABASE_ANON_KEY') || secreta;
  return { secreta, publica };
}
function cabecalhosBanco(chave) {
  // Chaves novas (sb_secret_...) vão só no apikey; a chave antiga (JWT) também vai como Bearer.
  const h = { apikey: chave, 'Content-Type': 'application/json' };
  if (chave.startsWith('eyJ')) h.Authorization = `Bearer ${chave}`;
  return h;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function iguais(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function enviarTodos(linhas, env, fetchFn) {
  const base = env('SUPABASE_URL');
  const { secreta } = chaves(env);
  const vapid = { publica: env('VAPID_PUBLIC_KEY'), privada: env('VAPID_PRIVATE_KEY'), sub: env('VAPID_SUBJECT') || 'mailto:lembrete@example.com' };
  const r = { enviados: 0, removidos: 0, falhas: 0 };
  for (const linha of linhas) {
    let status = 0;
    try { status = await enviarPush(linha, vapid, fetchFn); } catch (e) { console.error('envio', e); }
    if (status >= 200 && status < 300) r.enviados++;
    else if (status === 404 || status === 410) {
      // O aparelho cancelou as notificações ou o app foi desinstalado: apaga a inscrição.
      await fetchFn(`${base}/rest/v1/push_inscricoes?endpoint=eq.${encodeURIComponent(linha.endpoint)}`,
        { method: 'DELETE', headers: cabecalhosBanco(secreta) });
      r.removidos++;
    } else { r.falhas++; console.error('push recusado', status, new URL(linha.endpoint).origin); }
  }
  return r;
}

async function rpc(nome, args, env, fetchFn) {
  const resp = await fetchFn(`${env('SUPABASE_URL')}/rest/v1/rpc/${nome}`,
    { method: 'POST', headers: cabecalhosBanco(chaves(env).secreta), body: JSON.stringify(args) });
  if (!resp.ok) throw new Error(`rpc ${nome}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

const ehHttps = (u) => typeof u === 'string' && u.length <= 1000 && /^https:\/\/[^\s]+$/.test(u);
const ehChave = (k) => typeof k === 'string' && k.length > 0 && k.length <= 200 && /^[\w-]+=*$/.test(k);

async function trocarInscricao({ antigo, nova }, env, fetchFn) {
  const keys = (nova && nova.keys) || {};
  if (!ehHttps(antigo) || !nova || !ehHttps(nova.endpoint) || !ehChave(keys.p256dh) || !ehChave(keys.auth)) {
    return json({ erro: 'pedido inválido' }, 400);
  }
  const alvo = `${env('SUPABASE_URL')}/rest/v1/push_inscricoes?endpoint=eq.${encodeURIComponent(antigo)}`;
  const h = cabecalhosBanco(chaves(env).secreta);
  const resp = await fetchFn(alvo, {
    method: 'PATCH',
    headers: { ...h, Prefer: 'return=representation' },
    body: JSON.stringify({ endpoint: nova.endpoint, p256dh: keys.p256dh, auth: keys.auth }),
  });
  if (resp.status === 409) {
    // O app já registrou o endereço novo ao abrir: basta tirar o antigo.
    await fetchFn(alvo, { method: 'DELETE', headers: h });
    return json({ trocado: true });
  }
  if (!resp.ok) throw new Error(`troca: ${resp.status} ${await resp.text()}`);
  const linhas = await resp.json();
  if (!Array.isArray(linhas) || !linhas.length) return json({ erro: 'inscrição antiga não encontrada' }, 404);
  return json({ trocado: true });
}

export async function tratar(req, env, fetchFn = fetch) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method === 'GET') return json({ chave: env('VAPID_PUBLIC_KEY') || '' });
  if (req.method !== 'POST') return json({ erro: 'método não aceito' }, 405);

  try {
    let corpo = {};
    try { corpo = await req.clone().json(); } catch { corpo = {}; }

    // 0) Troca de inscrição feita pelo service worker, sem login.
    if (corpo && corpo.acao === 'trocar') return await trocarInscricao(corpo, env, fetchFn);

    // 1) Agendamento do banco.
    const segredo = req.headers.get('x-lembrete-segredo');
    if (segredo) {
      if (!iguais(segredo, env('LEMBRETE_SEGREDO') || '')) return json({ erro: 'não autorizado' }, 401);
      const linhas = await rpc('lembretes_devidos', {}, env, fetchFn);
      return json(await enviarTodos(linhas, env, fetchFn));
    }

    // 2) Botão "Enviar teste agora" do app, com o login da pessoa.
    const auth = req.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ erro: 'não autorizado' }, 401);
    const quem = await fetchFn(`${env('SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: chaves(env).publica, Authorization: auth } });
    if (!quem.ok) return json({ erro: 'não autorizado' }, 401);
    const usuario = await quem.json();
    if (!usuario || !usuario.id) return json({ erro: 'não autorizado' }, 401);

    const linhas = await rpc('lembrete_teste', { p_owner: usuario.id }, env, fetchFn);
    if (!linhas.length) return json({ erro: 'Nenhum aparelho recebe notificações. Ative as notificações neste aparelho primeiro.' }, 409);
    return json(await enviarTodos(linhas, env, fetchFn));
  } catch (e) {
    console.error(e);
    return json({ erro: 'Algo deu errado no envio. Veja os logs da função no Supabase.' }, 500);
  }
}

// No Supabase (Deno), a função atende os pedidos. Nos testes (Node), só as partes acima são usadas.
const D = globalThis.Deno;
if (D && typeof D.serve === 'function') D.serve((req) => tratar(req, (k) => D.env.get(k)));
