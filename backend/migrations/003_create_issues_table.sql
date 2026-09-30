-- ============================================================
-- Agentic Self-Healing Data Pipeline
-- Phase 5: Data Quality Issues Table
-- Schema: data_agent
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/odluvpuqrjpywahwwyiz/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS "data_agent".issues (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id    UUID NOT NULL REFERENCES "data_agent".datasets(id) ON DELETE CASCADE,
    agent_run_id  UUID,
    issue_type    TEXT NOT NULL,
    column_name   TEXT,
    severity      TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    confidence    NUMERIC NOT NULL DEFAULT 1.0,
    description   TEXT NOT NULL,
    evidence_json JSONB DEFAULT '{}'::jsonb,
    status        TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'REJECTED', 'IGNORED')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issues_dataset_id
    ON "data_agent".issues (dataset_id);

CREATE INDEX IF NOT EXISTS idx_issues_issue_type
    ON "data_agent".issues (issue_type);

CREATE INDEX IF NOT EXISTS idx_issues_severity
    ON "data_agent".issues (severity);

COMMENT ON TABLE "data_agent".issues IS
    'Deterministic and agent-detected data quality issues per dataset.';

COMMENT ON COLUMN "data_agent".issues.issue_type IS
    'Issue category: e.g. MISSING_VALUES, DUPLICATES, CONSTANT_COLUMN, NEAR_CONSTANT_COLUMN, POSSIBLE_IDENTIFIER, HIGH_CARDINALITY, TYPE_MISMATCH';

COMMENT ON COLUMN "data_agent".issues.severity IS
    'Issue severity: LOW, MEDIUM, HIGH, CRITICAL';
