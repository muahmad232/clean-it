import React, { useState } from 'react'
import {
  ExternalLink,
  Download,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  Database,
  Loader2,
  AlertCircle
} from 'lucide-react'

const BENCHMARK_DATASETS = [
  {
    id: 'titanic',
    title: 'Titanic Survival Benchmark',
    recommendedTask: 'CLASSIFICATION',
    targetCol: 'Survived',
    size: '60 KB',
    rows: '891',
    cols: '12',
    url: 'https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv',
    filename: 'titanic.csv',
    description: 'The classic ML benchmark with severe real-world data traps.',
    traps: [
      { name: 'Age: 177 missing values (~20%)', type: 'numeric_imputation' },
      { name: 'Cabin: 77.1% null (exceeds 70% threshold -> auto-drop)', type: 'high_null' },
      { name: 'PassengerId: 100% unique surrogate key -> target leakage drop', type: 'identifier' },
      { name: 'Embarked: 2 missing categoricals -> imputed with Unknown', type: 'categorical_imputation' },
    ],
  },
  {
    id: 'telco',
    title: 'IBM Telco Customer Churn',
    recommendedTask: 'CLASSIFICATION',
    targetCol: 'Churn',
    size: '950 KB',
    rows: '7,043',
    cols: '21',
    url: 'https://raw.githubusercontent.com/IBM/telco-customer-churn-on-icp4d/master/data/Telco-Customer-Churn.csv',
    filename: 'Telco-Customer-Churn.csv',
    description: 'Real enterprise telecom subscription records with subtle type corruptions.',
    traps: [
      { name: 'TotalCharges: Numeric stored as String with blank spaces', type: 'type_mismatch' },
      { name: 'customerID: High-cardinality surrogate ID -> dropped for ML', type: 'identifier' },
      { name: 'Missing value exposure after numeric cast -> median imputed', type: 'imputation' },
    ],
  },
  {
    id: 'adult',
    title: 'Adult Census Income Dataset',
    recommendedTask: 'CLASSIFICATION',
    targetCol: 'income',
    size: '3.8 MB',
    rows: '32,561',
    cols: '15',
    url: 'https://raw.githubusercontent.com/guru99-edu/R-Programming/master/adult_data.csv',
    filename: 'adult_census_income.csv',
    description: 'US Census Bureau records predicting whether annual income exceeds $50K.',
    traps: [
      { name: 'x: Auto-increment index column -> purged as numeric identifier', type: 'identifier' },
      { name: 'Whitespace in text columns -> automatically trimmed', type: 'whitespace' },
      { name: 'Missing values marked with ? -> detected & handled', type: 'missing' },
    ],
  },
  {
    id: 'planets',
    title: 'NASA Exoplanet Discoveries',
    recommendedTask: 'REGRESSION',
    targetCol: 'orbital_period',
    size: '45 KB',
    rows: '1,035',
    cols: '6',
    url: 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/planets.csv',
    filename: 'nasa_planets.csv',
    description: 'Astrophysical telescope observation data across different detection methods.',
    traps: [
      { name: 'mass: >48% null values -> imputed with median', type: 'numeric_imputation' },
      { name: 'distance: >21% missing telescope distances -> median imputed', type: 'numeric_imputation' },
      { name: 'Continuous regression targets with scientific notation', type: 'numeric' },
    ],
  },
]

export default function RecommendedDatasets({ onSelectDataset, isUploading }) {
  const [loadingId, setLoadingId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [fetchError, setFetchError] = useState(null)

  const handleLoadDirectly = async (dataset) => {
    setLoadingId(dataset.id)
    setFetchError(null)

    try {
      const response = await fetch(dataset.url)
      if (!response.ok) {
        throw new Error(`Failed to fetch dataset (${response.status})`)
      }
      const blob = await response.blob()
      const file = new File([blob], dataset.filename, { type: 'text/csv' })

      if (onSelectDataset) {
        onSelectDataset(file, dataset.recommendedTask)
      }
    } catch (err) {
      console.error(err)
      setFetchError(`Could not load ${dataset.title} directly: ${err.message}. You can download the CSV using the direct link below.`)
    } finally {
      setLoadingId(null)
    }
  }

  const handleCopyLink = (dataset) => {
    navigator.clipboard.writeText(dataset.url)
    setCopiedId(dataset.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2.5rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
          <span className="badge badge-cyan" style={{ fontSize: '0.75rem' }}>
            <Database size={12} /> Curated Benchmark Test Suites
          </span>
        </div>
        <h2 style={{ fontSize: '1.4rem' }}>
          Recommended Dirty Test Datasets
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
          These standard real-world datasets contain specific data quality anomalies designed to test the self-healing cleaning engine.
          Load them directly with 1 click or download the CSV to your machine.
        </p>
      </div>

      {fetchError && (
        <div style={{
          background: 'var(--rose-bg)',
          border: '1px solid var(--rose-border)',
          color: 'var(--rose-primary)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.875rem',
        }}>
          <AlertCircle size={18} />
          {fetchError}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
        gap: '1.25rem',
      }}>
        {BENCHMARK_DATASETS.map((ds) => {
          const isLoadingThis = loadingId === ds.id

          return (
            <div
              key={ds.id}
              style={{
                background: 'rgba(255, 255, 255, 0.025)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
              }}
            >
              <div>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {ds.title}
                  </h3>
                  <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                    {ds.recommendedTask}
                  </span>
                </div>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                  {ds.description}
                </p>

                {/* Dimensions */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  <span className="badge badge-muted" style={{ fontSize: '0.72rem' }}>
                    {ds.rows} rows &bull; {ds.cols} cols
                  </span>
                  <span className="badge badge-muted" style={{ fontSize: '0.72rem' }}>
                    {ds.size}
                  </span>
                </div>

                {/* Traps List */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                    Pipeline Traps Tested:
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {ds.traps.map((trap, idx) => (
                      <li key={idx} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ color: 'var(--cyan-primary)', fontSize: '0.7rem' }}>&bull;</span>
                        {trap.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Actions */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  onClick={() => handleLoadDirectly(ds)}
                  disabled={isUploading || isLoadingThis}
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {isLoadingThis ? (
                    <>
                      <Loader2 size={14} className="spin" />
                      Fetching & Ingesting Dataset...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      Load Directly into Pipeline
                    </>
                  )}
                </button>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <a
                    href={ds.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    style={{ flex: 1, justifyContent: 'center', fontSize: '0.78rem' }}
                  >
                    <Download size={13} />
                    Download CSV
                  </a>
                  <button
                    onClick={() => handleCopyLink(ds)}
                    className="btn btn-ghost btn-sm"
                    style={{ flex: 1, justifyContent: 'center', fontSize: '0.78rem' }}
                    title="Copy direct raw CSV URL"
                  >
                    {copiedId === ds.id ? (
                      <>
                        <Check size={13} color="var(--emerald-primary)" />
                        Copied Link
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
