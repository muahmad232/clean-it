-- ============================================================
-- Agentic Self-Healing Data Pipeline
-- Phase 12: Human Approval System Schema
-- Schema: data_agent
-- ============================================================

CREATE TABLE IF NOT EXISTS "data_agent".action_approvals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id          UUID NOT NULL REFERENCES "data_agent".datasets(id) ON DELETE CASCADE,
    project_id          UUID REFERENCES "data_agent".projects(id) ON DELETE SET NULL,
    action_type         TEXT NOT NULL,
    target_columns      JSONB DEFAULT '[]'::jsonb,
    parameters          JSONB DEFAULT '{}'::jsonb,
    reasoning           TEXT NOT NULL,
    risk_level          TEXT NOT NULL DEFAULT 'HIGH' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    confidence          NUMERIC DEFAULT 0.95,
    rows_affected_est   INTEGER DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED')),
    user_feedback       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_approvals_dataset_id
    ON "data_agent".action_approvals (dataset_id);

CREATE INDEX IF NOT EXISTS idx_approvals_dataset_status
    ON "data_agent".action_approvals (dataset_id, status);

CREATE INDEX IF NOT EXISTS idx_approvals_created_at
    ON "data_agent".action_approvals (created_at DESC);

COMMENT ON TABLE "data_agent".action_approvals IS
    'Pending and resolved human approvals for high-risk cleaning transformations before execution.';
