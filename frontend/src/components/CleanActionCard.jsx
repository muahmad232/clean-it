import React, { useState } from 'react'
import {
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileCheck,
  ShieldCheck,
  Filter,
  Check
} from 'lucide-react'
import { cleanDataset, getDownloadUrl } from '../api'

export default function CleanActionCard({
  dataset,
  projectId,
  profile,
  onCleanSuccess,
  isCleaning,
  setIsCleaning,
}) {
  const [taskType, setTaskType] = useState(dataset?.task_type || 'GENERAL')
  const [targetColumn, setTargetColumn] = useState(dataset?.target_column || '')
  const [cleaningReport, setCleaningReport] = useState(
    profile?.cleaning_report || dataset?.profile_json?.cleaning_report || null
  )
  const [error, setError] = useState(null)
  const [lastCleanedAt, setLastCleanedAt] = useState(null)

  const columns = profile?.columns?.map(c => c.name) || []

  const handleRunCleaning = async () => {
    setIsCleaning(true)
    setError(null)

    try {
      const res = await cleanDataset(
        projectId,
        dataset.id,
        taskType,
        targetColumn || null
      )
      setCleaningReport(res.report)
      setLastCleanedAt(new Date().toLocaleTimeString())
      if (onCleanSuccess) {
        onCleanSuccess(res)
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Cleaning execution failed.')
    } finally {
      setIsCleaning(false)
    }
  }

  const downloadUrl = getDownloadUrl(projectId, dataset.id)

  const beforeShape = cleaningReport?.before_shape || {
    rows: profile?.row_count || 0,
    columns: profile?.column_count || 0,
  }
  const afterShape = cleaningReport?.after_shape

  const rowsDelta = afterShape ? afterShape.rows - beforeShape.rows : 0
  const colsDelta = afterShape ? afterShape.columns - beforeShape.columns : 0

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      {/* Header & Configuration Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.25rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-muted">
              Polars Engine
            </span>
            {cleaningReport && (
              <span className="badge badge-green">
                <Check size={12} /> Cleaned
              </span>
            )}
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>
            Task-Aware Data Cleaning & Export
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginTop: '0.15rem' }}>
            Applies deterministic transformations for your modeling task. Original data remains unmodified.
          </p>
        </div>

        {/* Task Selection Form */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.65rem', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Target Machine Learning Task
            </label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              disabled={isCleaning}
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.4rem 0.65rem',
                fontSize: '0.825rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="GENERAL">General Clean</option>
              <option value="CLASSIFICATION">Classification (Drop Identifiers / Leakage)</option>
              <option value="REGRESSION">Regression (Median Impute)</option>
              <option value="CLUSTERING">Clustering (Drop High Nulls & IDs)</option>
              <option value="LLM_FINETUNING">LLM Fine-tuning (Whitespace & Noise Fix)</option>
            </select>
          </div>

          {(taskType === 'CLASSIFICATION' || taskType === 'REGRESSION') && (
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                Target Column (Protected)
              </label>
              <select
                value={targetColumn}
                onChange={(e) => setTargetColumn(e.target.value)}
                disabled={isCleaning}
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.4rem 0.65rem',
                  fontSize: '0.825rem',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">-- Select Target Column --</option>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleRunCleaning}
            disabled={isCleaning}
            className="btn btn-primary btn-sm"
            style={{ padding: '0.45rem 1rem' }}
          >
            {isCleaning ? (
              <>
                <Loader2 size={14} className="spin" />
                Cleaning...
              </>
            ) : (
              cleaningReport ? 'Re-Clean Dataset' : `Clean for ${taskType}`
            )}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'var(--rose-bg)',
          border: '1px solid var(--rose-border)',
          color: 'var(--rose-primary)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.65rem 0.85rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.825rem',
        }}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* When Cleaned: Delta Report + Download */}
      {cleaningReport ? (
        <div>
          {/* Metric Tiles */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.25rem',
          }}>
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.85rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Output Dimensions
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.25rem' }}>
                {afterShape.rows.toLocaleString()} × {afterShape.columns}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                from {beforeShape.rows.toLocaleString()} × {beforeShape.columns}
              </div>
            </div>

            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.85rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Duplicates Removed
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.25rem' }}>
                {cleaningReport.duplicates_removed || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                redundant rows purged
              </div>
            </div>

            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.85rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Type Casts Fixed
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.25rem' }}>
                {cleaningReport.type_casts?.length || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                string numbers cast to float
              </div>
            </div>

            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.85rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Columns Imputed
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.25rem' }}>
                {Object.keys(cleaningReport.imputed_nulls || {}).length}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                median & unknown fill
              </div>
            </div>
          </div>

          {/* Applied Operations List */}
          <div style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '1rem',
            marginBottom: '1.25rem',
            fontSize: '0.825rem',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={15} color="var(--emerald-primary)" />
              Transformations Applied ({cleaningReport.task_type})
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
                  Target Leakage Identifiers Dropped:
                </span>
                {cleaningReport.identifiers_dropped?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {cleaningReport.identifiers_dropped.map((id) => (
                      <span key={id} className="badge badge-rose" style={{ fontFamily: 'var(--font-mono)' }}>
                        {id}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>None detected</span>
                )}
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
                  Catastrophic Null Columns Dropped (&gt;70%):
                </span>
                {cleaningReport.high_null_columns_dropped?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {cleaningReport.high_null_columns_dropped.map((c) => (
                      <span key={c} className="badge badge-amber" style={{ fontFamily: 'var(--font-mono)' }}>
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>None detected</span>
                )}
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
                  Zero-Variance Constant Columns Dropped:
                </span>
                {cleaningReport.constant_columns_dropped?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {cleaningReport.constant_columns_dropped.map((c) => (
                      <span key={c} className="badge badge-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>None detected</span>
                )}
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
                  Type Mismatches Casted:
                </span>
                {cleaningReport.type_casts?.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: '1rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    {cleaningReport.type_casts.map((tc, idx) => (
                      <li key={idx} style={{ fontFamily: 'var(--font-mono)' }}>{tc}</li>
                    ))}
                  </ul>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>None detected</span>
                )}
              </div>
            </div>

            {Object.keys(cleaningReport.imputed_nulls || {}).length > 0 && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                  Imputed Missing Values:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.78rem' }}>
                  {Object.entries(cleaningReport.imputed_nulls).map(([col, detail]) => (
                    <span key={col} style={{ color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{col}:</strong> {detail}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Download Action Strip */}
          <div style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-sm)',
            padding: '1rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.95rem' }}>
                <FileCheck size={18} color="var(--emerald-primary)" />
                Cleaned Dataset Ready for Download
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                {dataset?.original_filename ? `cleaned_${dataset.original_filename}` : 'cleaned_dataset.csv'} &bull; Prepared for {cleaningReport.task_type}
                {lastCleanedAt ? ` &bull; ${lastCleanedAt}` : ''}
              </p>
            </div>

            <a
              href={downloadUrl}
              download
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Download size={15} />
              Download Cleaned CSV
            </a>
          </div>
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '1.5rem 1rem',
          background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-sm)',
          border: '1px dashed var(--border-medium)',
        }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            Configure your target task above and click <strong>Clean for {taskType}</strong> to execute deterministic transformations and generate a downloadable clean CSV.
          </p>
          <button
            onClick={handleRunCleaning}
            disabled={isCleaning}
            className="btn btn-primary btn-sm"
          >
            {isCleaning ? <Loader2 size={13} className="spin" /> : null}
            Execute Cleaning Engine
          </button>
        </div>
      )}
    </div>
  )
}
