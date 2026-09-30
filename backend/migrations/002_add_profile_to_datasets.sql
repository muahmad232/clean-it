-- ============================================================
-- Migration 002: Add profile fields to data_agent.datasets
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE "data_agent".datasets
    ADD COLUMN IF NOT EXISTS profile_json  JSONB,
    ADD COLUMN IF NOT EXISTS profiled_at   TIMESTAMPTZ;

COMMENT ON COLUMN "data_agent".datasets.profile_json IS
    'Compact profile produced by Polars. Stored as JSONB for direct querying.';

COMMENT ON COLUMN "data_agent".datasets.profiled_at IS
    'Timestamp of when the dataset was last profiled.';
