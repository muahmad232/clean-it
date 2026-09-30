import React from 'react'
import { Server, Database, HardDrive, Cpu, ShieldCheck, ArrowRight, FileCheck, RefreshCw } from 'lucide-react'

export default function InfoPage() {
  const flowSteps = [
    { title: "1. Upload", desc: "User uploads CSV/JSON/Parquet directly to storage with magic-byte and size validation (≤ 50MB).", icon: <Database size={18} /> },
    { title: "2. Polars Profiler", desc: "Lazy scan_csv streaming calculates exact null counts, memory footprint, quantiles, and shape.", icon: <Cpu size={18} /> },
    { title: "3. Issue Engine", desc: "Deterministic rules evaluate duplicates, zero-variance, high-cardinality, and type mismatches.", icon: <ShieldCheck size={18} /> },
    { title: "4. LLM Summary", desc: "Generates an ~800-token compact summary payload formatted specifically for Groq API context windows.", icon: <Server size={18} /> },
    { title: "5. Agent Reasoner", desc: "Groq LLM proposes a structured cleaning plan selecting ONLY from an authorized tool catalog.", icon: <RefreshCw size={18} /> },
    { title: "6. Reversible Apply", desc: "Deterministic tools apply transformations, create versioned Parquet deltas, and roll back if quality drops.", icon: <FileCheck size={18} /> },
  ]

  const detectors = [
    {
      name: "MISSING_VALUES",
      condition: "null_pct > 0.0%",
      severity: "LOW (<5%) | MEDIUM (5-25%) | HIGH (25-60%) | CRITICAL (≥60%)",
      explanation: "Computes exact null counts per column and flags sparsity for median/mode imputation or column elimination."
    },
    {
      name: "DUPLICATES",
      condition: "duplicate_row_count > 0",
      severity: "LOW (<2%) | MEDIUM (2-10%) | HIGH (10-25%) | CRITICAL (≥25%)",
      explanation: "Checks entire dataset for identical duplicate records, preventing biased models and inflated sample weights."
    },
    {
      name: "CONSTANT_COLUMN",
      condition: "n_unique == 1 (non-null)",
      severity: "HIGH",
      explanation: "Zero-variance columns provide 0 predictive signal, waste RAM, and cause singular matrices in linear models."
    },
    {
      name: "NEAR_CONSTANT_COLUMN",
      condition: "top_value_frequency > 95%",
      severity: "MEDIUM",
      explanation: "A single value dominates >95% of rows, warning the user or model of extreme skew and limited entropy."
    },
    {
      name: "POSSIBLE_IDENTIFIER",
      condition: "unique_pct == 100% (String)",
      severity: "LOW",
      explanation: "Unique strings (UUIDs, transaction IDs) that would cause catastrophic target leakage or overfitting if left in features."
    },
    {
      name: "HIGH_CARDINALITY",
      condition: "unique_pct > 50% and < 100%",
      severity: "MEDIUM",
      explanation: "Categorical columns with too many distinct values, warning against naive one-hot encoding dimensional explosions."
    },
    {
      name: "TYPE_MISMATCH",
      condition: "String col matches ≥80% numbers/dates/booleans",
      severity: "HIGH (≥95%) | MEDIUM (≥80%)",
      explanation: "Ingestion artifacts where numeric or timestamp values were misinferred as strings during CSV parsing."
    },
  ]

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <span className="badge badge-cyan" style={{ marginBottom: '0.75rem' }}>
          Hardware Budgets & Execution Specifications
        </span>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem' }}>
          Engine Architecture & Limits
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '750px', margin: '0 auto', lineHeight: 1.6 }}>
          How Clean-It achieves enterprise-grade data profiling and autonomous cleaning on a 512MB RAM free-tier budget.
        </p>
      </div>

      {/* Visual Pipeline Flow */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Cpu size={20} color="var(--cyan-primary)" />
          End-to-End Pipeline Execution Flow
        </h3>

        <div className="grid-3" style={{ gap: '1rem' }}>
          {flowSteps.map((step, sIdx) => (
            <div
              key={sIdx}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                padding: '1.25rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--cyan-primary)', marginBottom: '0.5rem' }}>
                {step.icon}
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{step.title}</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* RAM Budget Breakdown */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '3rem', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
        <h3 style={{ fontSize: '1.25rem', color: 'var(--emerald-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <HardDrive size={20} />
          Render Free-Tier 512 MB RAM Budget Strategy
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Strict memory isolation ensures zero out-of-memory (OOM) crashes on 512 MB containers.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              <span>Polars Streaming Scan & Aggregations (Peak)</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan-primary)' }}>~300 MB (58%)</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: '58%', height: '100%', background: 'var(--cyan-primary)' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              <span>FastAPI ASGI Workers & Background Tasks</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--violet-secondary)' }}>~100 MB (20%)</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: '20%', height: '100%', background: 'var(--violet-secondary)' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              <span>Scikit-Learn Baseline ML Evaluation (Optional)</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--emerald-primary)' }}>~80 MB (15%)</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: '15%', height: '100%', background: 'var(--emerald-primary)' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              <span>Local LLM Weights (Never loaded locally)</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>0 MB (0% - Offloaded to Groq)</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: '0%', height: '100%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* The 7 Detectors Table */}
      <div>
        <h3 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
          Phase 5 Deterministic Quality Engine Specifications
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
          Mathematical criteria utilized by the backend rule engine without any LLM hallucination.
        </p>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Detector</th>
                <th>Trigger Condition</th>
                <th>Severity Scale</th>
                <th>Engineering Justification</th>
              </tr>
            </thead>
            <tbody>
              {detectors.map((d, dIdx) => (
                <tr key={dIdx}>
                  <td style={{ fontWeight: 600, color: 'var(--cyan-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    {d.name}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                    {d.condition}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {d.severity}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {d.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
