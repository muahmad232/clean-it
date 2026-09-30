import React, { useState } from 'react'
import {
  Sparkles,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  ArrowRight,
  Database,
  Layers,
  ShieldCheck,
  RefreshCw,
  FileCheck
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
    <div className="glass-panel" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>
              <Sparkles size={12} /> Deterministic Polars Engine
            </span>
            {cleaningReport && (
              <span className="badge badge-emerald" style={{ fontSize: '0.75rem' }}>
                <CheckCircle2 size={12} /> Cleaned & Ready for Download
              </span>
            )}
          </div>
          <h2 style={{ fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            Task-Aware Data Cleaning & Export
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.2rem' }}>
            Transforms raw data deterministically based on your modeling requirements. Non-destructive: original remains intact.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
              Target Machine Learning Task
            </label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              disabled={isCleaning}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.45rem 0.75rem',
                fontSize: '0.85rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="GENERAL" style={{ background: '#0d131f' }}>General Clean</option>
              <option value="CLASSIFICATION" style={{ background: '#0d131f' }}>Classification (Drop Identifiers / Leakage)</option>
              <option value="REGRESSION" style={{ background: '#0d131f' }}>Regression (Median Impute / Drop IDs)</option>
              <option value="CLUSTERING" style={{ background: '#0d131f' }}>Clustering (Drop High Nulls & IDs)</option>
              <option value="LLM_FINETUNING" style={{ background: '#0d131f' }}>LLM Fine-tuning (Whitespace & Noise Fix)</option>
            </select>
          </div>

          {(taskType === 'CLASSIFICATION' || taskType === 'REGRESSION') && (
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                Target Feature Column (Protected)
              </label>
              <select
                value={targetColumn}
                onChange={(e) => setTargetColumn(e.target.value)}
                disabled={isCleaning}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.45rem 0.75rem',
                  fontSize: '0.85rem',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="" style={{ background: '#0d131f' }}>-- Select Target Column --</option>
                {columns.map((c) => (
                  <option key={c} value={c} style={{ background: '#0d131f' }}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ alignSelf: 'flex-end' }}>
            <button
              onClick={handleRunCleaning}
              disabled={isCleaning}
              className="btn btn-primary"
              style={{
                boxShadow: '0 0 15px rgba(0, 242, 254, 0.3)',
                padding: '0.55rem 1.25rem',
              }}
            >
              {isCleaning ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Cleaning Dataset...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  {cleaningReport ? 'Re-Clean Dataset' : `Clean for ${taskType}`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
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
          {error}
        </div>
      )}

      {/* Cleaning Report View */}
      {cleaningReport ? (
        <div>
          {/* Transformation Delta Summary Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}>
            {/* Shape Delta */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Dataset Dimensions
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.35rem' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {afterShape.rows.toLocaleString()} × {afterShape.columns}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  (from {beforeShape.rows.toLocaleString()} × {beforeShape.columns})
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.75rem' }}>
                {rowsDelta < 0 && (
                  <span className="badge badge-rose">{rowsDelta} rows purged</span>
                )}
                {colsDelta < 0 && (
                  <span className="badge badge-amber">{colsDelta} cols dropped</span>
                )}
                {rowsDelta === 0 && colsDelta === 0 && (
                  <span className="badge badge-emerald">Shape Preserved</span>
                )}
              </div>
            </div>

            {/* Duplicates Cleaned */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Duplicates Removed
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.35rem', color: cleaningReport.duplicates_removed > 0 ? 'var(--emerald-primary)' : 'var(--text-primary)' }}>
                {cleaningReport.duplicates_removed || 0}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {cleaningReport.duplicates_removed > 0 ? 'Exact redundant rows purged' : 'Zero duplicate rows detected'}
              </p>
            </div>

            {/* Type Casts & Normalization */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Type Casts Fixed
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.35rem', color: cleaningReport.type_casts?.length > 0 ? 'var(--cyan-primary)' : 'var(--text-primary)' }}>
                {cleaningReport.type_casts?.length || 0}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                String-to-number mismatches corrected
              </p>
            </div>

            {/* Imputations */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Columns Imputed
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.35rem', color: Object.keys(cleaningReport.imputed_nulls || {}).length > 0 ? 'var(--violet-secondary)' : 'var(--text-primary)' }}>
                {Object.keys(cleaningReport.imputed_nulls || {}).length}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Median (numeric) & Unknown (categorical)
              </p>
            </div>
          </div>

          {/* Transformation Delta Detail Cards */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <ShieldCheck size={16} color="var(--emerald-primary)" />
              Transformation Operations Applied ({cleaningReport.task_type})
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
              {/* Identifiers Dropped */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <span style={{ fontWeight: 600, color: 'var(--rose-primary)', display: 'block', marginBottom: '0.25rem' }}>
                  Target Leakage Identifiers Dropped:
                </span>
                {cleaningReport.identifiers_dropped?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.3rem' }}>
                    {cleaningReport.identifiers_dropped.map((id) => (
                      <span key={id} className="badge badge-rose" style={{ fontFamily: 'var(--font-mono)' }}>
                        {id}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>None (No high-risk surrogate keys detected)</span>
                )}
              </div>

              {/* Catastrophic Null Columns Dropped */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <span style={{ fontWeight: 600, color: 'var(--amber-primary)', display: 'block', marginBottom: '0.25rem' }}>
                  Catastrophic Null Columns Dropped (&gt;70% null):
                </span>
                {cleaningReport.high_null_columns_dropped?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.3rem' }}>
                    {cleaningReport.high_null_columns_dropped.map((col) => (
                      <span key={col} className="badge badge-amber" style={{ fontFamily: 'var(--font-mono)' }}>
                        {col}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>None (All columns met minimum density)</span>
                )}
              </div>

              {/* Constant Columns Dropped */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <span style={{ fontWeight: 600, color: 'var(--violet-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Constant Columns Dropped (Zero Variance):
                </span>
                {cleaningReport.constant_columns_dropped?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.3rem' }}>
                    {cleaningReport.constant_columns_dropped.map((col) => (
                      <span key={col} className="badge badge-purple" style={{ fontFamily: 'var(--font-mono)' }}>
                        {col}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>None (All columns retain variance)</span>
                )}
              </div>

              {/* Type Mismatches Casted */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <span style={{ fontWeight: 600, color: 'var(--cyan-primary)', display: 'block', marginBottom: '0.25rem' }}>
                  Type Casts Applied:
                </span>
                {cleaningReport.type_casts?.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                    {cleaningReport.type_casts.map((tc, idx) => (
                      <li key={idx} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                        {tc}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>None (All column schemas matched data)</span>
                )}
              </div>
            </div>

            {/* Imputed Values Detail */}
            {Object.keys(cleaningReport.imputed_nulls || {}).length > 0 && (
              <div style={{ marginTop: '0.75rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <span style={{ fontWeight: 600, color: 'var(--emerald-primary)', display: 'block', marginBottom: '0.25rem' }}>
                  Missing Value Imputations:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.5rem', marginTop: '0.3rem' }}>
                  {Object.entries(cleaningReport.imputed_nulls).map(([col, detail]) => (
                    <div key={col} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>{col}:</span>
                      <span>{detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Download Action Section */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(0, 242, 254, 0.08) 100%)',
            border: '1px solid var(--emerald-border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileCheck size={20} color="var(--emerald-primary)" />
                <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  Cleaned Dataset is Ready
                </span>
                <span className="badge badge-emerald">Validated CSV</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {dataset?.original_filename ? `cleaned_${dataset.original_filename}` : 'cleaned_dataset.csv'} &bull; Prepared for {cleaningReport.task_type} modeling &bull; {lastCleanedAt ? `Cleaned at ${lastCleanedAt}` : ''}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <a
                href={downloadUrl}
                download
                className="btn btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
                  padding: '0.65rem 1.5rem',
                  fontSize: '0.95rem',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Download size={18} />
                Download Cleaned CSV
              </a>
            </div>
          </div>
        </div>
      ) : (
        /* Uncleaned State Call-To-Action */
        <div style={{
          textAlign: 'center',
          padding: '2rem 1rem',
          background: 'rgba(255, 255, 255, 0.015)',
          border: '1px dashed var(--border-medium)',
          borderRadius: 'var(--radius-md)',
        }}>
          <Database size={32} color="var(--cyan-primary)" style={{ opacity: 0.7, marginBottom: '0.75rem' }} />
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.35rem' }}>
            Ready for Task-Aware Cleaning
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: '520px', margin: '0 auto 1.25rem' }}>
            Choose your target task (e.g. <strong>Classification</strong> or <strong>Regression</strong>) above and click <strong>Clean for {taskType}</strong> to trigger Polars deterministic transformations and generate a downloadable clean CSV.
          </p>
          <button
            onClick={handleRunCleaning}
            disabled={isCleaning}
            className="btn btn-primary btn-sm"
          >
            {isCleaning ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            Execute Cleaning Engine Now
          </button>
        </div>
      )}
    </div>
  )
}
