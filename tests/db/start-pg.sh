#!/bin/sh
# Liga o Postgres local de teste se ele não estiver rodando (só para os testes do banco).
D=/var/tmp/pgtest
psql -h $D -p 5499 -U postgres -Atqc "select 1" >/dev/null 2>&1 && exit 0
B=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
if [ ! -d $D/data ]; then
  rm -rf $D; mkdir -p $D; chown postgres $D
  su postgres -s /bin/sh -c "$B/initdb -D $D/data -A trust -U postgres >/dev/null"
fi
su postgres -s /bin/sh -c "$B/pg_ctl -D $D/data -o '-k $D -p 5499 -c listen_addresses=' -l $D/log -w start >/dev/null"
