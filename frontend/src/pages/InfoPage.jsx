import React from 'react'
import { Server, Database, HardDrive, Cpu, ShieldCheck, FileCheck, RefreshCw } from 'lucide-react'

export default function InfoPage() {
  const flowSteps = [
    { title: "1. Ingest Guard", desc: "Validates CSV/JSON/Parquet magic bytes, encoding, and size threshold (≤ 50 MB).", icon: <Database size={16} /> },
    { title: "2. Polars Profiler", desc: "Streaming lazy scan calculates exact null ratios, RAM requirements, quantiles, and shape.", icon: <Cpu size={16} /> },
    { title: "3. Rule Engine", desc: "Evaluates exact duplicates, zero-variance columns, high cardinality, and type mismatches.", icon: <ShieldCheck size={16} /> },
    { title: "4. Fingerprint Payload", desc: "Generates an ~400-token compact summary formatted specifically for downstream planning.", icon: <Server size={16} /> },
    { title: "5. Task Cleaning", desc: "Applies deterministic Python operations tailored for classification, regression, or general tasks.", icon: <RefreshCw size={16} /> },
    { title: "6. Immutable Export", desc: "Stores cleaned CSV in object storage and returns a before-and-after audit log.", icon: <FileCheck size={16} /> },
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
      condition: "unique_pct == 100% (String/Numeric ID)",
      severity: "LOW / HIGH for ML",
      explanation: "Unique strings or sequential IDs (UUIDs, transaction IDs) that cause target leakage or overfitting."
    },
    {
      name: "HIGH_CARDINALITY",
      condition: "unique_pct > 50% and < 100%",
      severity: "MEDIUM",
      explanation: "Categorical columns with too many distinct values, warning against naive one-hot encoding explosions."
    },
    {
      name: "TYPE_MISMATCH",
      condition: "String col matches ≥80% numbers/dates",
      severity: "HIGH (≥95%) | MEDIUM (≥80%)",
      explanation: "Ingestion artifacts where numeric or timestamp values were misinferred as strings during CSV parsing."
    },
    {
      name: "OUTLIER",
      condition: "Values outside IQR bounds [Q1 - 1.5*IQR, Q3 + 1.5*IQR] or |z| > 3.0",
      severity: "HIGH (≥10% or extreme) | MEDIUM (≥3%) | LOW",
      explanation: "Extreme observations that distort statistical estimators, variance, and distance-based ML models."
    },
    {
      name: "INVALID_RANGE",
      condition: "Values violating domain constraints (age ∉ [0, 125], % ∉ [0, 100], price < 0)",
      severity: "HIGH (≥10%) | MEDIUM (≥1%) | LOW",
      explanation: "Semantic domain violations such as negative ages, prices, or probabilities exceeding physical bounds."
    },
    {
      name: "DISTRIBUTION_SHIFT",
      condition: "KS distance ≥ 0.25, mean shift ≥ 30%, or TVD ≥ 0.25",
      severity: "HIGH (KS ≥ 0.40) | MEDIUM (KS ≥ 0.25)",
      explanation: "Statistical drift between baseline/transformed data or sequential temporal ordering drift."
    },
    {
      name: "CLASS_IMBALANCE",
      condition: "Majority-to-minority class ratio ≥ 4.0:1 (minority ≤ 20%)",
      severity: "HIGH (ratio ≥ 10:1) | MEDIUM (ratio ≥ 4:1)",
      explanation: "Severe target category skew that causes classification models to collapse onto majority classes."
    },
    {
      name: "TARGET_LEAKAGE",
      condition: "Feature correlation |r| ≥ 0.90 with supervised target",
      severity: "CRITICAL (|r| ≥ 0.98) | HIGH (|r| ≥ 0.90)",
      explanation: "Dangerous proxies or future-leaked data that artificially inflate model performance before real-world failure."
    },
    {
      name: "DATE_PARSE_ERROR",
      condition: "Conflicting date formats (YYYY-MM-DD vs MM/DD/YYYY) or unparseable calendar dates",
      severity: "HIGH (≥10% corrupt) | MEDIUM",
      explanation: "Inconsistent timestamp strings, invalid calendar days (e.g. Feb 30), or corrupt date formatting."
    },
  ]

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.75rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span className="badge badge-muted">
            Technical Architecture
          </span>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Hardware Budgets & Execution Specifications
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, maxWidth: '750px' }}>
          How Clean-It executes high-throughput data profiling and cleaning within a strict 512 MB RAM container budget.
        </p>
      </div>

      {/* Visual Pipeline Flow */}
      <div className="card" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Cpu size={18} color="var(--text-secondary)" />
          End-to-End Pipeline Execution Flow
        </h3>

        <div className="grid-3" style={{ gap: '0.75rem' }}>
          {flowSteps.map((step, sIdx) => (
            <div
              key={sIdx}
              style={{
                background: 'var(--bg-subtle)',
                padding: '1rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                {step.icon}
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{step.title}</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.5 }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* RAM Budget Breakdown */}
      <div className="card" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <HardDrive size={18} color="var(--text-secondary)" />
          Memory Budget Allocation (512 MB Container)
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginBottom: '1.25rem' }}>
          Strict lazy evaluation ensures zero out-of-memory crashes on memory-constrained servers.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Polars Streaming Scan & Aggregations (Peak)</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>~300 MB (58%)</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'var(--bg-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: '58%', height: '100%', background: 'var(--text-secondary)' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>FastAPI ASGI Runtime & Workers</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>~100 MB (20%)</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'var(--bg-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: '20%', height: '100%', background: 'var(--text-muted)' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Buffer & Ingestion Overhead</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>~80 MB (15%)</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'var(--bg-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: '15%', height: '100%', background: 'var(--text-dim)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* The 7 Detectors Table */}
      <div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.35rem' }}>
          Deterministic Issue Detector Rules
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Criteria evaluated by the Polars engine on raw data without dynamic code generation.
        </p>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Detector</th>
                <th>Trigger Rule</th>
                <th>Severity Scale</th>
                <th>Engineering Justification</th>
              </tr>
            </thead>
            <tbody>
              {detectors.map((d, dIdx) => (
                <tr key={dIdx}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {d.name}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {d.condition}
                  </td>
                  <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {d.severity}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
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
