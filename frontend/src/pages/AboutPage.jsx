import React from 'react'
import { Shield, Cpu, Lock, CheckCircle2, AlertTriangle, Layers, GitBranch, ArrowRight, Zap } from 'lucide-react'

export default function AboutPage({ onNavigate }) {
  const constraints = [
    { rule: "Never send raw datasets to Groq API", reason: "Prevents token explosion and data privacy leaks. Only compact statistical fingerprints (~800 tokens) are shared." },
    { rule: "Never execute arbitrary LLM code", reason: "LLMs reason and select from a deterministic Python tool registry. No unverified eval() or raw scripts." },
    { rule: "Never overwrite original files", reason: "All transformations create immutable versions. The original CSV is permanently preserved in Supabase Storage." },
    { rule: "Never store raw data in PostgreSQL", reason: "PostgreSQL holds only lightweight metadata, JSONB profiles, and issue registries. Files stay in object storage." },
    { rule: "Never trust LLM numbers for stats", reason: "LLMs hallucinate mathematical distributions. Polars and DuckDB compute exact ground truth metrics." },
    { rule: "Never materialise full files into RAM", reason: "Streaming scan_csv and lazy frames keep memory within the Render free-tier 512MB RAM budget." },
  ]

  const phases = [
    { phase: "Phase 1", name: "Minimal Backend", desc: "FastAPI skeleton, CORS, health endpoint & structured logging.", status: "complete" },
    { phase: "Phase 2", name: "Supabase Foundation", desc: "PostgreSQL schema, dedicated data_agent isolation & Storage buckets.", status: "complete" },
    { phase: "Phase 3", name: "Dataset Upload", desc: "Ingest validation (encoding, magic bytes, size guard) & metadata creation.", status: "complete" },
    { phase: "Phase 4", name: "Deterministic Profiler", desc: "Polars streaming scan, memory telemetry, and token-budgeted LLM summary.", status: "complete" },
    { phase: "Phase 5", name: "Basic Issue Detection", desc: "7 deterministic detectors: nulls, duplicates, constant, near-constant, IDs, types.", status: "complete" },
    { phase: "Phase 6", name: "Frontend Dashboard", desc: "Interactive data studio, schema inspection, and issue telemetry visualizer.", status: "active" },
    { phase: "Phase 7", name: "Groq LLM Integration", desc: "qwen/qwen3-32b reasoning provider for structured Pydantic cleaning plans.", status: "upcoming" },
    { phase: "Phase 8", name: "Reversible Storage & Versions", desc: "Delta versioning, Parquet snapshots, and automatic rollback triggers.", status: "upcoming" },
    { phase: "Phase 9", name: "Tool Registry & Execution", desc: "Deterministic cleaning tools: remove_duplicates, impute, outlier clips.", status: "upcoming" },
    { phase: "Phase 10", name: "Autonomous Healing Loop", desc: "Self-healing iteration, quality score deltas, and human-in-the-loop approvals.", status: "upcoming" },
  ]

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <span className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>
          Philosophy & Architectural Mandate
        </span>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem' }}>
          Not a Chatbot. <br />
          <span style={{
            background: 'var(--grad-ai)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            An Agentic Data-Engineering Engine.
          </span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '750px', margin: '0 auto', lineHeight: 1.6 }}>
          Generic LLM chatbots tell you how to clean CSVs in theory. Clean-It is built to autonomously inspect, measure, propose, execute deterministic tools, and roll back if quality degrades.
        </p>
      </div>

      {/* The Golden Rule */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '3rem', border: '1px solid rgba(0, 242, 254, 0.3)' }}>
        <h3 style={{ fontSize: '1.25rem', color: 'var(--cyan-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Zap size={20} /> The Golden Rule of Division of Labour
        </h3>

        <div className="grid-3" style={{ marginTop: '1.25rem' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ color: 'var(--violet-secondary)', fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>
              1. LLM (Groq API)
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Reason + plan + select tools from an authorized catalog. <strong>Never</strong> allowed to compute statistics or fabricate metrics.
            </p>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ color: 'var(--cyan-primary)', fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>
              2. Python (Polars Engine)
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Measure + transform + validate. <strong>Never</strong> trust LLM numbers. Ground-truth deterministic math executed on raw bytes.
            </p>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ color: 'var(--emerald-primary)', fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>
              3. Safety & Version Layer
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Compare quality deltas + require human approval for high-risk drops + roll back if an action worsens downstream metrics.
            </p>
          </div>
        </div>
      </div>

      {/* Hard Constraints */}
      <div style={{ marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
          Immutable Engineering Constraints
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
          Guarantees built into the backend architecture to ensure security, privacy, and stability on resource-constrained free tiers.
        </p>

        <div className="grid-2">
          {constraints.map((c, i) => (
            <div key={i} className="glass-panel" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--rose-primary)', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.35rem' }}>
                <Lock size={15} />
                {c.rule}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {c.reason}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Phased Roadmap */}
      <div>
        <h3 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
          Master Pipeline Roadmap
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
          Progress across all 10 engineering phases.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {phases.map((p, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.25rem',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  color: p.status === 'complete' ? 'var(--emerald-primary)' : p.status === 'active' ? 'var(--cyan-primary)' : 'var(--text-muted)',
                  minWidth: '65px',
                  fontWeight: 600,
                }}>
                  {p.phase}
                </span>

                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                    {p.name}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    {p.desc}
                  </div>
                </div>
              </div>

              <div>
                {p.status === 'complete' && <span className="badge badge-emerald">Passed (109 Tests)</span>}
                {p.status === 'active' && <span className="badge badge-cyan">In Progress</span>}
                {p.status === 'upcoming' && <span className="badge badge-muted">Next</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
