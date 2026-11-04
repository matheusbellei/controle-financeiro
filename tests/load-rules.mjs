// Extrai a seção 4 (regras puras) do index.html e a executa isolada.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadSection(n) {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(new RegExp(`/\\* === ${n} [^=]+=== \\*/([\\s\\S]*?)/\\* === FIM ${n} === \\*/`));
  if (!m) throw new Error(`seção ${n} não encontrada`);
  return m[1];
}

export function loadRules() {
  const ctx = vm.createContext({ Intl, Date, Math, Map, Set, Number, String, Array, Object, JSON });
  vm.runInContext(loadSection(4), ctx);
  return ctx;
}
