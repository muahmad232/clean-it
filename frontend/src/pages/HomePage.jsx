import React, { useState } from 'react'
import {
  ArrowRight,
  Database,
  ShieldCheck,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  Loader2,
  CheckCircle2,
  Terminal,
  Activity,
  Layers
} from 'lucide-react'

const BENCHMARKS = [
  {
    id: 'titanic',
    title: 'Titanic Survival Dataset',
    task: 'CLASSIFICATION',
    target: 'Survived',
    size: '60 KB',
    rows: '891',
    cols: '12',
    url: 'https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv',
    filename: 'titanic.csv',
    description: 'Binary classification benchmark with missing ages, 77% null cabin column, and surrogate key leakage.',
    tags: ['Missing Imputation', 'Surrogate Key Purge', 'High Null Drop'],
  },
  {
    id: 'telco',
    title: 'IBM Telco Customer Churn',
    task: 'CLASSIFICATION',
    target: 'Churn',
    size: '950 KB',
    rows: '7,043',
    cols: '21',
    url: 'https://raw.githubusercontent.com/IBM/telco-customer-churn-on-icp4d/master/data/Telco-Customer-Churn.csv',
    filename: 'Telco-Customer-Churn.csv',
    description: 'Enterprise subscription data where numeric charges are stored as strings with blank space nulls.',
    tags: ['Type Mismatch Fix', 'Whitespace Trimming', 'Identifier Dropped'],
  },
  {
    id: 'adult',
    title: 'Adult Census Income',
    task: 'CLASSIFICATION',
    target: 'income',
    size: '3.8 MB',
    rows: '32,561',
    cols: '15',
    url: 'https://raw.githubusercontent.com/guru99-edu/R-Programming/master/adult_data.csv',
    filename: 'adult_census_income.csv',
    description: 'US Census demographic records with auto-increment index columns and whitespace-padded categories.',
    tags: ['Index Identifier Drop', 'String Normalization', 'High Cardinality'],
  },
  {
    id: 'planets',
    title: 'NASA Exoplanet Discoveries',
    task: 'REGRESSION',
    target: 'orbital_period',
    size: '45 KB',
    rows: '1,035',
    cols: '6',
    url: 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/planets.csv',
    filename: 'nasa_planets.csv',
    description: 'Astrophysical telescope observation data containing missing orbital mass and distance features.',
    tags: ['Numeric Imputation', 'Scientific Notation', 'Regression Target'],
  },
]

export default function HomePage({ onNavigate, onStartWithFile }) {
  const [loadingId, setLoadingId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  const handleLaunchSample = async (sample) => {
    setLoadingId(sample.id)
    try {
      const res = await fetch(sample.url)
      const blob = await res.blob()
      const file = new File([blob], sample.filename, { type: 'text/csv' })
      if (onStartWithFile) {
        onStartWithFile(file, sample.task)
      } else {
        onNavigate('studio')
      }
    } catch (err) {
      console.error('Error loading sample dataset:', err)
      onNavigate('studio')
    } finally {
      setLoadingId(null)
    }
  }

  const handleCopy = (url, id) => {
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Hero Section */}
      <section style={{ padding: '3.5rem 0 3rem', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <span className="badge badge-muted">
            Deterministic Data Engineering
          </span>
          <span className="badge badge-green">
            v1.0 Ready
          </span>
        </div>

        <h1 style={{ fontSize: '2.6rem', fontWeight: 700, maxWidth: '820px', lineHeight: 1.2, marginBottom: '1.25rem' }}>
          Clean-It: High-performance data quality and task-aware dataset preparation.
        </h1>

        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '720px', lineHeight: 1.6, marginBottom: '2rem' }}>
          Inspect tabular datasets with streaming Polars metrics, automatically diagnose corruptions, and apply deterministic transformations tailored for your downstream ML models.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => onNavigate('studio')}
            className="btn btn-primary"
            style={{ padding: '0.65rem 1.4rem' }}
          >
            Launch Data Studio <ArrowRight size={16} />
          </button>
          <button
            onClick={() => onNavigate('about')}
            className="btn btn-secondary"
          >
            Methodology & Rules
          </button>
          <button
            onClick={() => onNavigate('info')}
            className="btn btn-ghost"
          >
            System Specifications
          </button>
        </div>
      </section>

      {/* 3 Core Principles Grid */}
      <section style={{ padding: '3rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.5rem' }}>
          Engineering Principles
        </div>

        <div className="grid-3">
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Terminal size={18} color="var(--text-primary)" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Deterministic Metrics</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.55 }}>
              No hallucinated stats or arbitrary code generation. Polars lazy frames process datasets directly in memory with exact row, column, null, and duplicate counts.
            </p>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <ShieldCheck size={18} color="var(--emerald-primary)" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Target Leakage Protection</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.55 }}>
              In classification and regression tasks, surrogate identifiers (IDs, UUIDs, row numbers) are automatically purged so models do not learn trivial index shortcuts.
            </p>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Database size={18} color="var(--accent-blue)" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Non-Destructive Storage</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.55 }}>
              Original uploaded files are permanently preserved in object storage. Cleaning outputs a new validated CSV accompanied by a transparent delta audit report.
            </p>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section style={{ padding: '3rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.5rem' }}>
          Data Pipeline Workflow
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '1.25rem' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.35rem' }}>STEP 01</div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.35rem' }}>Ingest Table</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Upload CSV, JSON, or Parquet files up to 50 MB with encoding and header validation.
            </p>
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '1.25rem' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.35rem' }}>STEP 02</div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.35rem' }}>Quality Profiling</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Automatic scans flag missing values, duplicates, constant columns, and string number types.
            </p>
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '1.25rem' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.35rem' }}>STEP 03</div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.35rem' }}>Task-Aware Clean</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Select target task to impute medians, strip whitespace, and drop leaking identifiers.
            </p>
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '1.25rem' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.35rem' }}>STEP 04</div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.35rem' }}>Export Clean CSV</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Download your verified dataset ready for scikit-learn, XGBoost, PyTorch, or pandas.
            </p>
          </div>
        </div>
      </section>

      {/* Benchmark Datasets Section */}
      <section style={{ padding: '3rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
              Interactive Benchmarks
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 600 }}>
              Test the pipeline with known dirty datasets
            </h2>
          </div>
          <button
            onClick={() => onNavigate('studio')}
            className="btn btn-secondary btn-sm"
          >
            Open Blank Studio <ArrowRight size={14} />
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem',
        }}>
          {BENCHMARKS.map((b) => (
            <div
              key={b.id}
              className="card"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>
                    {b.task}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {b.size}
                  </span>
                </div>

                <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                  {b.title}
                </h4>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: '0.85rem' }}>
                  {b.description}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
                  {b.tags.map((tag) => (
                    <span key={tag} className="badge badge-muted" style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.85rem', display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => handleLaunchSample(b)}
                  disabled={loadingId === b.id}
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {loadingId === b.id ? (
                    <>
                      <Loader2 size={13} className="spin" />
                      Loading...
                    </>
                  ) : (
                    'Load in Studio'
                  )}
                </button>
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                  title="Download Raw CSV"
                  style={{ padding: '0.35rem 0.55rem' }}
                >
                  <Download size={14} />
                </a>
                <button
                  onClick={() => handleCopy(b.url, b.id)}
                  className="btn btn-ghost btn-sm"
                  title="Copy Raw URL"
                  style={{ padding: '0.35rem 0.55rem' }}
                >
                  {copiedId === b.id ? <Check size={14} color="var(--emerald-primary)" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
