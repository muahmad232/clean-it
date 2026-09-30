import React from 'react'
import { Shield, Lock, CheckCircle2, ArrowRight } from 'lucide-react'

export default function AboutPage({ onNavigate }) {
  const constraints = [
    { rule: "Never send raw datasets to LLM APIs", reason: "Prevents token explosion and data privacy leaks. Only compact statistical fingerprints (~400 tokens) are processed." },
    { rule: "Never execute arbitrary LLM code", reason: "All cleaning operations execute verified, deterministic Python functions. Zero unverified eval() or dynamic scripts." },
    { rule: "Never overwrite original files", reason: "All transformations produce immutable output versions. The original CSV is permanently preserved in storage." },
    { rule: "Never store raw tables in relational databases", reason: "Relational DBs hold only lightweight metadata and issue registries. Heavy tables remain in object storage." },
    { rule: "Never trust LLM numbers for statistics", reason: "Polars streaming engines compute exact ground truth counts, null proportions, and unique distributions." },
    { rule: "Never materialize full files into RAM", reason: "Streaming scan_csv and lazy frames keep memory within the 512MB RAM budget." },
  ]

  const phases = [
    { phase: "Phase 1", name: "FastAPI Backend Skeleton", desc: "CORS, health endpoint & structured logging.", status: "complete" },
    { phase: "Phase 2", name: "Supabase Isolation", desc: "PostgreSQL schema, data_agent isolation & object storage buckets.", status: "complete" },
    { phase: "Phase 3", name: "Dataset Ingestion Guard", desc: "Encoding checks, magic bytes verification, and metadata creation.", status: "complete" },
    { phase: "Phase 4", name: "Polars Streaming Profiler", desc: "Lazy-frame scanning, memory telemetry, and token-budgeted summaries.", status: "complete" },
    { phase: "Phase 5", name: "Deterministic Rule Detectors", desc: "7 detectors: nulls, duplicates, constant, near-constant, IDs, types.", status: "complete" },
    { phase: "Phase 6", name: "Task-Aware Cleaning & Download", desc: "Deterministic cleaner, target leakage prevention, and clean CSV export.", status: "complete" },
    { phase: "Phase 7", name: "Groq Reasoning Provider", desc: "Structured cleaning plan synthesis using lightweight telemetry.", status: "upcoming" },
    { phase: "Phase 8", name: "Delta Versioning & Snapshots", desc: "Immutable transformation trees and rollback triggers.", status: "upcoming" },
    { phase: "Phase 9", name: "Autonomous Healing Engine", desc: "Quality score verification and human-in-the-loop approvals.", status: "upcoming" },
  ]

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.75rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span className="badge badge-muted">
            Architecture & Philosophy
          </span>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Deterministic Division of Labour
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, maxWidth: '750px' }}>
          Clean-It enforces a strict separation between mathematical measurement and reasoning. Ground-truth math is executed in pure Polars, while downstream agents focus purely on planning.
        </p>
      </div>

      {/* The Core Three-Tier Mandate */}
      <div className="card" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          The Three Architectural Tiers
        </h3>

        <div className="grid-3" style={{ marginTop: '1rem' }}>
          <div style={{ background: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
              1. Reasoning Tier
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>
              Selects tools and organizes task plans. <strong>Never</strong> allowed to guess statistics or fabricate numeric distributions.
            </p>
          </div>

          <div style={{ background: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
              2. Polars Engine Tier
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>
              Measures, profiles, and executes transformations. Exact ground-truth math computed directly on byte streams.
            </p>
          </div>

          <div style={{ background: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
              3. Verification Tier
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>
              Evaluates before-and-after quality deltas, guards protected target columns, and enables non-destructive exports.
            </p>
          </div>
        </div>
      </div>

      {/* Hard Constraints */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.35rem' }}>
          System Safety Constraints
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          Inviolable rules enforced in code to guarantee resource stability, privacy, and determinism.
        </p>

        <div className="grid-2">
          {constraints.map((c, i) => (
            <div key={i} className="card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--rose-primary)', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.3rem' }}>
                <Lock size={14} />
                {c.rule}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                {c.reason}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Phased Roadmap */}
      <div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.35rem' }}>
          Engineering Status & Roadmap
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          115 unit and integration tests verified across completed phases.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {phases.map((p, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.85rem 1rem',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  color: p.status === 'complete' ? 'var(--emerald-primary)' : 'var(--text-muted)',
                  minWidth: '60px',
                  fontWeight: 600,
                }}>
                  {p.phase}
                </span>

                <div>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                    {p.name}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    {p.desc}
                  </div>
                </div>
              </div>

              <div>
                {p.status === 'complete' && <span className="badge badge-green">Passed</span>}
                {p.status === 'upcoming' && <span className="badge badge-muted">Scheduled</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
