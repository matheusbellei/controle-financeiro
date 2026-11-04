// Cliente Supabase simulado: registra a cadeia de chamadas e devolve uma resposta programada.
export function fakeClient(response = { data: [], error: null }, auth = {}) {
  const calls = [];
  const builder = (table) => {
    const chain = { table, ops: [] };
    calls.push(chain);
    const proxy = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (res, rej) => Promise.resolve(typeof response === 'function' ? response(chain) : response).then(res, rej);
        return (...args) => { chain.ops.push([prop, ...args]); return proxy; };
      },
    });
    return proxy;
  };
  return {
    calls,
    from: builder,
    auth: {
      signInWithPassword: async (c) => auth.signIn ? auth.signIn(c) : { data: { user: { id: 'u1', email: c.email } }, error: null },
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: auth.session || null } }),
      onAuthStateChange: (cb) => { auth.cb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    },
  };
}
