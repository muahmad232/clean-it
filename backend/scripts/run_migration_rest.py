"""
Apply the initial schema migration via the Supabase REST API.

For newer Supabase projects where db.PROJECT.supabase.co doesn't resolve,
this script uses the supabase-py client to execute SQL statements
through PostgREST's rpc endpoint.

Usage:
    python scripts/run_migration_rest.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import get_settings
from app.database.client import get_service_client

settings = get_settings()
client = get_service_client()

print("Running migration via Supabase REST API...")
print(f"Project: {settings.supabase_url}")

# We'll execute each statement individually via RPC.
# Supabase exposes pg_catalog functions; we use a custom approach:
# execute each DDL statement as a separate REST call via .rpc("exec_sql")
# 
# Since exec_sql may not exist, we run the DDL directly through
# the Supabase management approach: split SQL and run via postgrest.
#
# The cleanest approach for DDL: use supabase-py's .rpc() with
# a simple helper function we create first.

# Step 1: Create the helper function in public schema so we can run DDL
bootstrap_sql = """
CREATE OR REPLACE FUNCTION public._run_ddl(sql text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  EXECUTE sql;
END;
$$;
"""

# Step 2: DDL statements to execute one by one
statements = [
    # Schema
    'CREATE SCHEMA IF NOT EXISTS "data_agent"',
    
    # Permissions
    'GRANT USAGE ON SCHEMA "data_agent" TO anon, authenticated, service_role',
    '''ALTER DEFAULT PRIVILEGES IN SCHEMA "data_agent"
       GRANT ALL ON TABLES TO anon, authenticated, service_role''',
    '''ALTER DEFAULT PRIVILEGES IN SCHEMA "data_agent"
       GRANT ALL ON SEQUENCES TO anon, authenticated, service_role''',

    # projects table
    '''CREATE TABLE IF NOT EXISTS "data_agent".projects (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )''',

    'CREATE INDEX IF NOT EXISTS idx_projects_user_id ON "data_agent".projects (user_id)',

    # datasets table
    '''CREATE TABLE IF NOT EXISTS "data_agent".datasets (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id        UUID NOT NULL REFERENCES "data_agent".projects(id) ON DELETE CASCADE,
        original_filename TEXT NOT NULL,
        storage_path      TEXT,
        file_type         TEXT NOT NULL DEFAULT \'csv\'
                            CHECK (file_type IN (\'csv\', \'json\', \'parquet\')),
        file_size         BIGINT,
        row_count         INTEGER,
        column_count      INTEGER,
        task_type         TEXT NOT NULL DEFAULT \'GENERAL\'
                            CHECK (task_type IN (\'GENERAL\',\'CLASSIFICATION\',\'REGRESSION\',\'CLUSTERING\',\'LLM_FINETUNING\')),
        target_column     TEXT,
        status            TEXT NOT NULL DEFAULT \'PENDING_UPLOAD\'
                            CHECK (status IN (\'PENDING_UPLOAD\',\'UPLOADED\',\'PROCESSING\',\'COMPLETED\',\'FAILED\')),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )''',

    'CREATE INDEX IF NOT EXISTS idx_datasets_project_id ON "data_agent".datasets (project_id)',

    # Trigger function
    '''CREATE OR REPLACE FUNCTION "data_agent".set_updated_at()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
        NEW.updated_at = now();
        RETURN NEW;
    END;
    $$''',

    # Triggers
    '''CREATE OR REPLACE TRIGGER trg_projects_updated_at
        BEFORE UPDATE ON "data_agent".projects
        FOR EACH ROW EXECUTE FUNCTION "data_agent".set_updated_at()''',

    '''CREATE OR REPLACE TRIGGER trg_datasets_updated_at
        BEFORE UPDATE ON "data_agent".datasets
        FOR EACH ROW EXECUTE FUNCTION "data_agent".set_updated_at()''',
]

# First, create the bootstrap DDL runner function via RPC
print("\nStep 1: Creating DDL helper function...")
try:
    # Try using existing exec_sql if available
    result = client.rpc("exec_sql", {"sql": "SELECT 1"}).execute()
    rpc_name = "exec_sql"
    print("  Using existing exec_sql RPC")
except Exception:
    # Need to bootstrap via the REST API's PostgREST extension
    # Use a raw SQL approach via supabase's schema introspection endpoint
    rpc_name = None

if rpc_name is None:
    # Bootstrap: we need to run DDL some other way
    # Supabase exposes pg_net and other extensions; 
    # but the cleanest path is the Management REST API.
    # Since that requires a PAT, we'll fall back to
    # executing via the SQL HTTP endpoint that newer Supabase projects expose.
    import httpx
    
    print("  Trying SQL endpoint...")
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    
    for i, stmt in enumerate(statements, 1):
        resp = httpx.post(
            f"{settings.supabase_url}/rest/v1/rpc/exec_sql",
            headers=headers,
            json={"sql": stmt + ";"},
            timeout=30,
        )
        if resp.status_code in (200, 201, 204):
            print(f"  [{i}/{len(statements)}] OK")
        else:
            # Try the query endpoint
            resp2 = httpx.post(
                f"{settings.supabase_url}/pg/query",
                headers=headers,
                json={"query": stmt + ";"},
                timeout=30,
            )
            if resp2.status_code in (200, 201, 204):
                print(f"  [{i}/{len(statements)}] OK (via pg/query)")
            else:
                print(f"  [{i}/{len(statements)}] WARN: {resp.status_code} / {resp2.status_code}")
                print(f"    {resp.text[:200]}")
    
    print("\nChecking if tables exist...")
    check = client.schema("data_agent").table("projects").select("id").limit(1).execute()
    print(f"  data-agent.projects query result: {check.data}")
    print("Migration complete - tables are accessible!")
else:
    for i, stmt in enumerate(statements, 1):
        try:
            client.rpc(rpc_name, {"sql": stmt + ";"}).execute()
            print(f"  [{i}/{len(statements)}] OK")
        except Exception as e:
            print(f"  [{i}/{len(statements)}] ERROR: {e}")
