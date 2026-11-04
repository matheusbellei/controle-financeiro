// Banco em memória com as mesmas regras do RLS, só para testes de interface.
(function () {
  const USERS = [
    { id: 'u1', email: 'matheus@x.com', password: 'senha123' },
    { id: 'u2', email: 'ela@x.com', password: 'senha456' },
  ];
  const OWNED = ['transactions', 'recurrences', 'budgets', 'goals', 'goal_deposits'];
  const db = JSON.parse(sessionStorage.getItem('memdb') || 'null') || {
    profiles: [{ id: 'u1', name: 'Matheus' }, { id: 'u2', name: 'denise.teixeira249@gmail.com' }],
    tags: [], transactions: [], recurrences: [], budgets: [], goals: [], goal_deposits: [],
  };
  const save = () => sessionStorage.setItem('memdb', JSON.stringify(db));
  let n = Number(sessionStorage.getItem('memseq') || 0);
  const uid = () => { n++; sessionStorage.setItem('memseq', n); return 'id' + String(n).padStart(6, '0'); };
  let user = JSON.parse(sessionStorage.getItem('memuser') || 'null');
  const deny = () => { throw new Error('Você só pode alterar os seus próprios dados.'); };
  const need = () => { if (!user) throw new Error('Sua sessão expirou. Entre de novo.'); };
  window.__memdb = db;
  window.__memSeed = (table, rows) => { rows.forEach((r) => db[table].push({ id: uid(), ...r })); save(); };
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
        (!f.owner_id || r.owner_id === f.owner_id)).map((r) => ({ ...r }));
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
      if (table === 'tags' || table === 'profiles') deny();
      const i = db[table].findIndex((r) => r.id === id && r.owner_id === user.id);
      if (i >= 0) db[table].splice(i, 1); save();
    },
    async removeWhere(table, where) {
      need();
      const keep = db[table].filter((r) => !(Object.keys(where).every((k) => r[k] === where[k]) && r.owner_id === user.id));
      db[table].length = 0; db[table].push(...keep); save();
    },
  };
})();
