import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { jwtVapid, deb64url } from '../supabase/functions/lembrete-diario/index.ts';

const html = readFileSync(new URL('../ferramentas/gerar-chaves.html', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/agendar-lembrete.sql', import.meta.url), 'utf8');

function gerador() {
  const codigo = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const ctx = vm.createContext({ crypto: globalThis.crypto, btoa, Uint8Array, String, Array, document: { querySelector: () => null, addEventListener() {} } });
  vm.runInContext(codigo, ctx);
  return ctx.gerarChaves;
}

test('gerador de chaves: par VAPID que assina e segredo longo, sem nada sair do navegador', async () => {
  const k = await gerador()();
  assert.match(k.publica, /^B[\w-]{86}$/);       // 65 bytes, formato não comprimido
  assert.match(k.privada, /^[\w-]{43}$/);        // 32 bytes
  assert.match(k.segredo, /^[\w-]{43}$/);
  const jwt = await jwtVapid({ aud: 'https://fcm.googleapis.com', sub: 'mailto:a@b.c', publica: k.publica, privada: k.privada });
  assert.equal(jwt.split('.').length, 3);
  assert.equal(deb64url(k.publica).length, 65);
  const outra = await gerador()();
  assert.notEqual(outra.privada, k.privada);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src/);
});

test('agendamento: chama a função a cada 15 minutos com o segredo do cofre', () => {
  assert.match(sql, /cron\.schedule\(\s*'lembrete-diario',\s*'\*\/15 \* \* \* \*'/);
  assert.match(sql, /functions\/v1\/lembrete-diario/);
  assert.match(sql, /x-lembrete-segredo/);
  assert.match(sql, /vault\.decrypted_secrets where name = 'lembrete_segredo'/);
  assert.equal(sql.split("segredo text := 'COLE-O-SEGREDO-AQUI';").length - 1, 1, 'uma só linha para colar o segredo');
  assert.match(sql, /raise exception 'Troque COLE-O-SEGREDO-AQUI/);
});
