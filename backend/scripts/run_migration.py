"""
Apply the initial schema migration using a direct psycopg2 connection.

Usage:
    python scripts/run_migration.py

Requires SUPABASE_DB_URL in .env:
    SUPABASE_DB_URL=postgresql://postgres:[password]@db.odluvpuqrjpywahwwyiz.supabase.co:5432/postgres

Find your password at:
    Supabase Dashboard -> Project Settings -> Database -> Connection string (URI mode)
"""

import sys
from pathlib import Path

# Add backend root to path so we can import app.core.config
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import get_settings

settings = get_settings()
db_url = settings.supabase_db_url

if not db_url:
    print("[ERROR] SUPABASE_DB_URL is not set in .env")
    print("  Add: SUPABASE_DB_URL=postgresql://postgres:[password]@db.odluvpuqrjpywahwwyiz.supabase.co:5432/postgres")
    sys.exit(1)

try:
    import psycopg2
except ImportError:
    print("[ERROR] psycopg2-binary not installed.")
    print("  Run: pip install psycopg2-binary")
    sys.exit(1)

sql_file = Path(__file__).parent.parent / "migrations" / "001_initial_schema.sql"
sql = sql_file.read_text()

print(f"Connecting to Supabase...")
print(f"Running migration: {sql_file.name} ({len(sql)} chars)")

try:
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.close()
    print("Migration applied successfully!")
    print("Tables created: data-agent.projects, data-agent.datasets")
except Exception as e:
    print(f"Migration FAILED: {e}")
    sys.exit(1)
