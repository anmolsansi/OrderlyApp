"""Run only on the disposable ST11/ST13 local fixture database, never production."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlparse
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo

source_url = os.environ['DATABASE_URL']
parsed = urlparse(source_url)
if parsed.hostname != '127.0.0.1' or not parsed.path.startswith('/orderly_st11_st13_'):
    raise RuntimeError('Recovery rehearsal requires the disposable local ST11/ST13 database')
restore_name = f'orderly_restore_{uuid4().hex}'
restore_url = make_conninfo(source_url, dbname=restore_name)
admin_url = make_conninfo(source_url, dbname='postgres')
fixture = json.loads(Path('tests/fixtures/contracts/c5.json').read_text())
receipt = dict(fixture['positive']['receipt'], id=str(uuid4()))
owner = f'guest-recovery-{uuid4()}'
with psycopg.connect(source_url) as connection:
    connection.execute("INSERT INTO guest_sessions (id, token_hash, expires_at) VALUES (%s, %s, now() + interval '1 day')", (owner, uuid4().hex))
    connection.execute("INSERT INTO guest_carts (owner_id, revision, items) VALUES (%s, 7, '[]')", (owner,))
    connection.execute('INSERT INTO guest_orders (id, owner_id, snapshot, created_at) VALUES (%s, %s, %s::jsonb, %s)', (receipt['id'], owner, json.dumps(receipt), receipt['created_at']))
    connection.execute('INSERT INTO order_idempotency (owner_id, idempotency_key, payload_sha256, order_id) VALUES (%s, %s, %s, %s)', (owner, str(uuid4()), 'a' * 64, receipt['id']))
    connection.execute("INSERT INTO restaurants (id, name, cuisine, rating, delivery_minutes, delivery_fee_cents, image_emoji, is_open, tags) VALUES ('st11-recovery-catalog', 'Edited recovery catalog', 'Synthetic', 4.5, '10 min', 99, 'R', true, '[]') ON CONFLICT (id) DO UPDATE SET name = 'Edited recovery catalog'")


def digests(connection):
    tables = connection.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename").fetchall()
    return {
        table: hashlib.sha256(json.dumps(connection.execute(
            sql.SQL('SELECT to_jsonb(t) FROM {} t ORDER BY to_jsonb(t)::text').format(sql.Identifier(table))
        ).fetchall(), sort_keys=True).encode()).hexdigest()
        for (table,) in tables
    }


with psycopg.connect(admin_url, autocommit=True) as admin:
    admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(restore_name)))
    try:
        with tempfile.TemporaryDirectory(prefix='orderly-backup-') as directory:
            dump = str(Path(directory) / 'synthetic.dump')
            with psycopg.connect(source_url) as snapshot:
                snapshot.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
                expected = digests(snapshot)
                snapshot_id = snapshot.execute('SELECT pg_export_snapshot()').fetchone()[0]
                subprocess.run(['pg_dump', '--dbname', source_url, '--snapshot', snapshot_id, '--format=custom', '--no-owner', '--no-acl', '--file', dump], check=True)
            subprocess.run(['pg_restore', '--dbname', restore_url, '--single-transaction', '--exit-on-error', '--no-owner', '--no-acl', dump], check=True)
            with psycopg.connect(restore_url) as restored:
                assert digests(restored) == expected, 'Restored public data differs from the transaction-consistent source'
                actual = restored.execute('SELECT snapshot FROM guest_orders WHERE id = %s', (receipt['id'],)).fetchone()[0]
                assert actual == receipt
                assert restored.execute('SELECT revision FROM guest_carts WHERE owner_id = %s', (owner,)).fetchone()[0] == 7
                assert restored.execute("SELECT name FROM restaurants WHERE id = 'st11-recovery-catalog'").fetchone()[0] == 'Edited recovery catalog'
            print(json.dumps({'result': 'PASS', 'public_tables_compared': len(expected), 'full_receipt_equal': True, 'revision_equal': True, 'edited_catalog_equal': True, 'checksums': expected}, sort_keys=True))
    finally:
        admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(restore_name)))
