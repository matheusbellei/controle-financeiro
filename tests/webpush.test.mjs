import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b64url, deb64url, criptografar, jwtVapid, tratar } from '../supabase/functions/lembrete-diario/index.ts';

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const junta = (...ps) => { const r = new Uint8Array(ps.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of ps) { r.set(p, i); i += p.length; } return r; };
const hmac = async (k, d) => new Uint8Array(await subtle.sign('HMAC', await subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), d));
const jwkPriv = (d, pub) => ({ kty: 'EC', crv: 'P-256', d, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), ext: true });

// Lado do celular (RFC 8291/8188), escrito à parte para conferir o envio.
async function decifrar(corpo, uaPrivD, uaPub, authSecret) {
  const salt = corpo.slice(0, 16);
  const idlen = corpo[20];
  const asPub = corpo.slice(21, 21 + idlen);
  const cifra = corpo.slice(21 + idlen);
  const uaPriv = await subtle.importKey('jwk', jwkPriv(uaPrivD, uaPub), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const asKey = await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPriv, 256));
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, junta(enc.encode('WebPush: info\0'), uaPub, asPub, [1]));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, junta(enc.encode('Content-Encoding: aes128gcm\0'), [1]))).slice(0, 16);
  const nonce = (await hmac(prk, junta(enc.encode('Content-Encoding: nonce\0'), [1]))).slice(0, 12);
  const k = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const claro = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, cifra));
  let fim = claro.length - 1; while (claro[fim] === 0) fim--;
  assert.equal(claro[fim], 2, 'delimitador do último registro');
  return new TextDecoder().decode(claro.slice(0, fim));
}

async function novoCelular() {
  const par = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await subtle.exportKey('raw', par.publicKey));
  const d = (await subtle.exportKey('jwk', par.privateKey)).d;
  const auth = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { pub, d, auth, p256dh: b64url(pub), authB64: b64url(auth) };
}
async function novasChavesVapid() {
  const par = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { publica: b64url(new Uint8Array(await subtle.exportKey('raw', par.publicKey))), privada: (await subtle.exportKey('jwk', par.privateKey)).d };
}

test('criptografia bate com o exemplo do RFC 8291', async () => {
  const corpo = await criptografar(deb64url('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'), {
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  }, {
    salt: deb64url('DGv6ra1nlYgDCS1FRnbzlw'),
    remetente: { d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', publica: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8' },
  });
  assert.equal(b64url(corpo),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('criptografia com chaves novas: o celular consegue abrir (acentos e emoji inclusos)', async () => {
  const cel = await novoCelular();
  const texto = JSON.stringify({ titulo: 'Hora de lançar 💰', corpo: '“Preço é o que você paga.” — Warren Buffett' });
  const corpo = await criptografar(enc.encode(texto), { p256dh: cel.p256dh, auth: cel.authB64 });
  assert.equal(await decifrar(corpo, cel.d, cel.pub, cel.auth), texto);
});

test('assinatura VAPID: JWT ES256 válido para a origem do push', async () => {
  const v = await novasChavesVapid();
  const jwt = await jwtVapid({ aud: 'https://fcm.googleapis.com', sub: 'mailto:eu@x.com', publica: v.publica, privada: v.privada, agora: 1_000_000 });
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(deb64url(h))), { typ: 'JWT', alg: 'ES256' });
  const carga = JSON.parse(new TextDecoder().decode(deb64url(p)));
  assert.deepEqual(carga, { aud: 'https://fcm.googleapis.com', exp: 1_000_000 + 12 * 3600, sub: 'mailto:eu@x.com' });
  const chave = await subtle.importKey('raw', deb64url(v.publica), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, chave, deb64url(s), enc.encode(`${h}.${p}`)));
});

// ---------- a função em si, com o Supabase e os serviços de push simulados ----------
async function montar({ linhas = [], respostasPush = {}, usuario = null } = {}) {
  const v = await novasChavesVapid();
  const env = {
    SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_abc' }),
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_xyz' }),
    VAPID_PUBLIC_KEY: v.publica, VAPID_PRIVATE_KEY: v.privada, VAPID_SUBJECT: 'mailto:eu@x.com', LEMBRETE_SEGREDO: 'segredo-de-teste-123',
  };
  const chamadas = [];
  const fetchFalso = async (url, op = {}) => {
    const h = Object.fromEntries(Object.entries(op.headers || {}).map(([k, x]) => [k.toLowerCase(), x]));
    chamadas.push({ url: String(url), metodo: op.method || 'GET', h, corpo: op.body });
    const u = String(url);
    if (u.endsWith('/rest/v1/rpc/lembretes_devidos') || u.endsWith('/rest/v1/rpc/lembrete_teste')) return new Response(JSON.stringify(linhas), { status: 200 });
    if (u.endsWith('/auth/v1/user')) return usuario ? new Response(JSON.stringify(usuario), { status: 200 }) : new Response('{}', { status: 401 });
    if (u.includes('/rest/v1/push_inscricoes')) return new Response(null, { status: 204 });
    return new Response(null, { status: respostasPush[u] || 201 });
  };
  const chamar = (req) => tratar(req, (k) => env[k], fetchFalso);
  return { env, chamadas, chamar };
}
const req = (metodo, headers = {}, corpo) => new Request('https://proj.supabase.co/functions/v1/lembrete-diario', { method: metodo, headers, body: corpo });

test('função: devolve a chave pública e responde ao CORS do navegador', async () => {
  const f = await montar();
  const r = await f.chamar(req('GET'));
  assert.equal((await r.json()).chave, f.env.VAPID_PUBLIC_KEY);
  const o = await f.chamar(req('OPTIONS'));
  assert.equal(o.headers.get('access-control-allow-origin'), '*');
  assert.match(o.headers.get('access-control-allow-headers'), /authorization/i);
});

test('função: sem o segredo do agendamento ou login, não faz nada', async () => {
  const f = await montar();
  assert.equal((await f.chamar(req('POST', { 'x-lembrete-segredo': 'errado' }, '{}'))).status, 401);
  assert.equal((await f.chamar(req('POST', {}, '{}'))).status, 401);
  assert.equal((await f.chamar(req('POST', { authorization: 'Bearer token-ruim' }, '{"acao":"teste"}'))).status, 401);
  assert.equal(f.chamadas.filter((c) => c.url.includes('/rpc/')).length, 0);
});

test('função (agendamento): envia para cada aparelho, cifrado e assinado, e apaga aparelho que não existe mais', async () => {
  const c1 = await novoCelular(); const c2 = await novoCelular();
  const linhas = [
    { owner_id: 'u1', endpoint: 'https://fcm.googleapis.com/fcm/send/aaa', p256dh: c1.p256dh, auth: c1.authB64, titulo: 'Hora de lançar os gastos', corpo: 'Leva um minuto.' },
    { owner_id: 'u1', endpoint: 'https://web.push.apple.com/bbb', p256dh: c2.p256dh, auth: c2.authB64, titulo: 'Hora de lançar os gastos', corpo: 'Leva um minuto.' },
  ];
  const f = await montar({ linhas, respostasPush: { 'https://web.push.apple.com/bbb': 410 } });
  const r = await f.chamar(req('POST', { 'x-lembrete-segredo': 'segredo-de-teste-123', 'content-type': 'application/json' }, '{}'));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { enviados: 1, removidos: 1, falhas: 0 });

  const rpc = f.chamadas.find((c) => c.url.endsWith('/rpc/lembretes_devidos'));
  assert.equal(rpc.metodo, 'POST');
  assert.equal(rpc.h.apikey, 'sb_secret_abc');
  assert.equal(rpc.h.authorization, undefined, 'chave nova não vai como Bearer');

  const push = f.chamadas.find((c) => c.url === linhas[0].endpoint);
  assert.equal(push.metodo, 'POST');
  assert.equal(push.h['content-encoding'], 'aes128gcm');
  assert.ok(Number(push.h.ttl) > 0);
  assert.match(push.h.authorization, new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${f.env.VAPID_PUBLIC_KEY}$`));
  const aud = JSON.parse(new TextDecoder().decode(deb64url(push.h.authorization.split('t=')[1].split('.')[1]))).aud;
  assert.equal(aud, 'https://fcm.googleapis.com');
  assert.deepEqual(JSON.parse(await decifrar(new Uint8Array(push.corpo), c1.d, c1.pub, c1.auth)),
    { titulo: 'Hora de lançar os gastos', corpo: 'Leva um minuto.', url: './' });

  const apagar = f.chamadas.find((c) => c.metodo === 'DELETE');
  assert.equal(apagar.url, 'https://proj.supabase.co/rest/v1/push_inscricoes?endpoint=eq.' + encodeURIComponent('https://web.push.apple.com/bbb'));
});

test('função (teste pelo app): confere o login e envia só para os aparelhos da pessoa', async () => {
  const c1 = await novoCelular();
  const f = await montar({ usuario: { id: 'u1' }, linhas: [{ owner_id: 'u1', endpoint: 'https://fcm.googleapis.com/x', p256dh: c1.p256dh, auth: c1.authB64, titulo: 'T', corpo: 'C' }] });
  const r = await f.chamar(req('POST', { authorization: 'Bearer jwt-do-matheus', apikey: 'sb_publishable_xyz' }, '{"acao":"teste"}'));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { enviados: 1, removidos: 0, falhas: 0 });
  const quem = f.chamadas.find((c) => c.url.endsWith('/auth/v1/user'));
  assert.equal(quem.h.authorization, 'Bearer jwt-do-matheus');
  const rpc = f.chamadas.find((c) => c.url.endsWith('/rpc/lembrete_teste'));
  assert.deepEqual(JSON.parse(rpc.corpo), { p_owner: 'u1' });
});

test('função (teste pelo app): sem aparelho ativado, explica o que fazer', async () => {
  const f = await montar({ usuario: { id: 'u1' }, linhas: [] });
  const r = await f.chamar(req('POST', { authorization: 'Bearer jwt' }, '{"acao":"teste"}'));
  assert.equal(r.status, 409);
  assert.match((await r.json()).erro, /Ative as notificações neste aparelho/);
});
