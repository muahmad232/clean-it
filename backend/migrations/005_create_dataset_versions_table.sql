-- ============================================================
-- Agentic Self-Healing Data Pipeline
-- Phase 11: Dataset Versioning & Rollback Schema
-- Schema: data_agent
-- ============================================================

CREATE TABLE IF NOT EXISTS "data_agent".dataset_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id          UUID NOT NULL REFERENCES "data_agent".datasets(id) ON DELETE CASCADE,
    version_number      INTEGER NOT NULL,
    parent_version_id   UUID REFERENCES "data_agent".dataset_versions(id) ON DELETE SET NULL,
    storage_path        TEXT NOT NULL,
    file_type           TEXT NOT NULL DEFAULT 'parquet' CHECK (file_type IN ('parquet', 'csv', 'json')),
    quality_score       NUMERIC,
    metrics_json        JSONB DEFAULT '{}'::jsonb,
    created_by_action   TEXT,
    action_details      JSONB DEFAULT '{}'::jsonb,
    is_current          BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_dataset_version UNIQUE (dataset_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_versions_dataset_id
    ON "data_agent".dataset_versions (dataset_id);

CREATE INDEX IF NOT EXISTS idx_versions_dataset_current
    ON "data_agent".dataset_versions (dataset_id, is_current);

CREATE INDEX IF NOT EXISTS idx_versions_created_at
    ON "data_agent".dataset_versions (created_at DESC);

COMMENT ON TABLE "data_agent".dataset_versions IS
    'Immutable snapshots of dataset states across cleaning cycles, enabling reversible rollback.';
