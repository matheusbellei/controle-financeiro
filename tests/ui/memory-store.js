// Banco em memória com as mesmas regras do RLS, só para testes de interface.
(function () {
  const USERS = [
    { id: 'u1', email: 'matheus@x.com', password: 'senha123' },
    { id: 'u2', email: 'ela@x.com', password: 'senha456' },
  ];
  const OWNED = ['transactions', 'recurrences', 'budgets', 'goals', 'goal_deposits', 'tags', 'lembrete_config', 'push_inscricoes', 'frases'];
  const db = JSON.parse(sessionStorage.getItem('memdb') || 'null') || {
    profiles: [{ id: 'u1', name: 'Matheus' }, { id: 'u2', name: 'denise.teixeira249@gmail.com' }],
    tags: [], transactions: [], recurrences: [], budgets: [], goals: [], goal_deposits: [],
  };
  for (const t of ['lembrete_config', 'push_inscricoes', 'frases']) db[t] = db[t] || [];
  const save = () => sessionStorage.setItem('memdb', JSON.stringify(db));
  let n = Number(sessionStorage.getItem('memseq') || 0);
  const uid = () => { n++; sessionStorage.setItem('memseq', n); return 'id' + String(n).padStart(6, '0'); };
  let user = JSON.parse(sessionStorage.getItem('memuser') || 'null');
  const deny = () => { throw new Error('Você só pode alterar os seus próprios dados.'); };
  const need = () => { if (!user) throw new Error('Sua sessão expirou. Entre de novo.'); };
  window.__memdb = db;
  window.__memdbApagar = (table) => { db[table].length = 0; save(); };
  window.__memSeed = (table, rows) => {
    rows.forEach((r) => db[table].push({ id: uid(), ...(table === 'tags' ? { owner_id: r.created_by || 'u1' } : {}), ...r })); save();
  };
  window.__TEST_STORE__ = {
    async signIn(email, password) {
      const u = USERS.find((x) => x.email === email && x.password === password);
      if (!u) throw new Error('E-mail ou senha incorretos.');
      user = { id: u.id, email: u.email }; sessionStorage.setItem('memuser', JSON.stringify(user)); return user;
    },
    async signOut() { user = null; sessionStorage.removeItem('memuser'); },
    async restoreSession() { return user; },
    currentUser() { return user; },
    onAuthChange() {},
    async list(table, f = {}) {
      need();
      return db[table].filter((r) =>
        (!f.competence_from || r.competence_date >= f.competence_from) &&
        (!f.competence_to || r.competence_date <= f.competence_to) &&
        (!f.owner_id || r.owner_id === f.owner_id) &&
        (!OWNED.includes(table) || r.owner_id === user.id || (table === 'frases' && r.owner_id == null)) && (table !== 'profiles' || r.id === user.id)).map((r) => ({ ...r }));
    },
    async insert(table, rows) {
      need();
      const list = (Array.isArray(rows) ? rows : [rows]).map((r) => {
        const row = { id: uid(), ...r };
        if (OWNED.includes(table)) { row.owner_id = row.owner_id || user.id; if (row.owner_id !== user.id) deny(); }
        if (table === 'tags') { row.created_by = user.id; row.archived = row.archived || false; row.parent_id = row.parent_id || null; }
        if (table === 'transactions' && row.recurrence_id &&
          db.transactions.some((t) => t.recurrence_id === row.recurrence_id && t.competence_date === row.competence_date))
          throw new Error('Algo deu errado: duplicate key');
        return row;
      });
      db[table].push(...list); save(); return list.map((r) => ({ ...r }));
    },
    async update(table, id, campos) {
      need();
      const row = db[table].find((r) => r.id === id);
      if (!row) deny();
      if (OWNED.includes(table) && row.owner_id !== user.id) deny();
      if (table === 'profiles' && row.id !== user.id) deny();
      Object.assign(row, campos); save(); return { ...row };
    },
    async remove(table, id) {
      need();
      if (table === 'profiles') deny();
      if (table === 'tags') {
        if (!db.tags.some((t) => t.id === id && t.owner_id === user.id)) return;
        const apagar = new Set([id, ...db.tags.filter((t) => t.parent_id === id).map((t) => t.id)]);
        db.tags = db.tags.filter((t) => !apagar.has(t.id));
        window.__memdb.tags = db.tags;
        for (const t of [...db.transactions, ...db.recurrences]) if (apagar.has(t.tag_id)) t.tag_id = null;
        const b = db.budgets.filter((x) => !apagar.has(x.tag_id)); db.budgets.length = 0; db.budgets.push(...b);
        save(); return;
      }
      const i = db[table].findIndex((r) => r.id === id && r.owner_id === user.id);
      if (i >= 0) db[table].splice(i, 1); save();
    },
    async upsert(table, row) {
      need();
      if (table !== 'lembrete_config') throw new Error('upsert só para lembrete_config no banco de teste');
      if (row.owner_id && row.owner_id !== user.id) deny();
      let atual = db.lembrete_config.find((c) => c.owner_id === user.id);
      if (!atual) { atual = { owner_id: user.id }; db.lembrete_config.push(atual); }
      Object.assign(atual, row, { owner_id: user.id }); save(); return { ...atual };
    },
    async rpc(nome, args) {
      need();
      if (nome !== 'registrar_inscricao') throw new Error('rpc desconhecida: ' + nome);
      const resto = db.push_inscricoes.filter((i) => i.endpoint !== args.p_endpoint);
      db.push_inscricoes.length = 0;
      db.push_inscricoes.push(...resto, { id: uid(), owner_id: user.id, endpoint: args.p_endpoint, p256dh: args.p_p256dh, auth: args.p_auth, aparelho: args.p_aparelho || '' });
      save(); return null;
    },
    async invokeFunction(nome, { method = 'POST', body = null } = {}) {
      need();
      (window.__memFuncoes = window.__memFuncoes || []).push([nome, method, body]);
      if (method === 'GET') return { chave: 'BAECAw' };
      const n = db.push_inscricoes.filter((i) => i.owner_id === user.id).length;
      if (!n) throw new Error('Nenhum aparelho recebe notificações. Ative as notificações neste aparelho primeiro.');
      return { enviados: n, removidos: 0, falhas: 0 };
    },
    async removeWhere(table, where) {
      need();
      const keep = db[table].filter((r) => !(Object.keys(where).every((k) => r[k] === where[k]) && r.owner_id === user.id));
      db[table].length = 0; db[table].push(...keep); save();
    },
  };

  // Notificações do aparelho, simuladas. Nos testes: __pushNegar (pessoa bloqueia) e __pushPrecisaInstalar (iPhone sem instalar).
  window.__TEST_PUSH__ = {
    suportado: () => true,
    precisaInstalar: () => !!window.__pushPrecisaInstalar,
    permissao: () => sessionStorage.getItem('mempush-perm') || 'default',
    async inscricaoAtual() { const x = sessionStorage.getItem('mempush'); return x ? JSON.parse(x) : null; },
    async inscrever(chave) {
      if (window.__pushNegar) { sessionStorage.setItem('mempush-perm', 'denied'); const e = new Error('negado'); e.code = 'negado'; throw e; }
      sessionStorage.setItem('mempush-perm', 'granted');
      window.__pushChaveUsada = Array.from(chave);
      const sub = { endpoint: 'https://push.teste/aparelho-1', keys: { p256dh: 'chave-p256dh', auth: 'segredo-auth' } };
      sessionStorage.setItem('mempush', JSON.stringify(sub)); return sub;
    },
    async cancelar() { sessionStorage.removeItem('mempush'); },
    nomeAparelho: () => 'Teste',
  };
})();
