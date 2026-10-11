import React, { useState } from 'react'
import {
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileCheck,
  ShieldCheck,
  Filter,
  Check,
  Brain,
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { cleanDataset, getDownloadUrl, evaluateDatasetMl } from '../api'

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
  const [mlReport, setMlReport] = useState(
    profile?.ml_evaluation || dataset?.profile_json?.ml_evaluation || null
  )
  const [mlLoading, setMlLoading] = useState(false)
  const [mlError, setMlError] = useState(null)

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
      if (res.ml_evaluation) {
        setMlReport(res.ml_evaluation)
      }
      if (res.target_column && !targetColumn) {
        setTargetColumn(res.target_column)
      }
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

  const handleRunMlBenchmark = async () => {
    if (!dataset?.id) return
    setMlLoading(true)
    setMlError(null)
    try {
      const res = await evaluateDatasetMl(
        projectId || dataset.project_id,
        dataset.id,
        {
          targetColumn: targetColumn.trim() || null,
          taskType: taskType,
          testSize: 0.20,
          randomState: 42,
        }
      )
      setMlReport(res)
      if (res?.target_column && !targetColumn) {
        setTargetColumn(res.target_column)
      }
    } catch (err) {
      console.error('ML benchmark failed:', err)
      setMlError(err.message || 'ML benchmark failed.')
    } finally {
      setMlLoading(false)
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
              <optgroup label="General / Unsupervised">
                <option value="GENERAL">General Clean (Universal)</option>
                <option value="CLUSTERING">Clustering / PCA</option>
                <option value="LLM_FINETUNING">LLM Fine-tuning</option>
                <option value="TIME_SERIES">Time Series / Forecasting</option>
              </optgroup>
              <optgroup label="Regression Tasks (Numeric Targets)">
                <option value="REGRESSION">Regression (General)</option>
                <option value="LINEAR_REGRESSION">Linear Regression (Scale & Outliers)</option>
                <option value="CONTINUOUS_REGRESSION">Continuous Regression (Target Impute)</option>
                <option value="POLYNOMIAL_REGRESSION">Polynomial Regression</option>
              </optgroup>
              <optgroup label="Classification Tasks (Discrete Targets)">
                <option value="CLASSIFICATION">Classification (General)</option>
                <option value="BINARY_CLASSIFICATION">Binary Classification (Churn / Fraud)</option>
                <option value="MULTICLASS_CLASSIFICATION">Multi-Class Classification</option>
                <option value="LOGISTIC_REGRESSION">Logistic Regression</option>
              </optgroup>
            </select>
          </div>

          {(['CLASSIFICATION', 'BINARY_CLASSIFICATION', 'MULTICLASS_CLASSIFICATION', 'LOGISTIC_REGRESSION', 'REGRESSION', 'LINEAR_REGRESSION', 'CONTINUOUS_REGRESSION', 'POLYNOMIAL_REGRESSION'].includes(taskType)) && (
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

          {/* ML Evaluation & Task Readiness Card */}
          {mlReport && mlReport.status === 'SUCCESS' && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.05), rgba(37, 99, 235, 0.05))',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '1.1rem 1.25rem',
              marginBottom: '1.25rem',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.65rem',
                marginBottom: '0.85rem',
                paddingBottom: '0.65rem',
                borderBottom: '1px solid rgba(6, 182, 212, 0.2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Brain size={18} color="var(--cyan-primary, #06b6d4)" />
                  <div>
                    <h4 style={{ fontSize: '0.925rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      ML Task Readiness Benchmark ({mlReport.model_name})
                    </h4>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      Target: <strong style={{ color: 'var(--text-primary)' }}>{mlReport.target_column}</strong>
                      {mlReport.target_inferred ? ' (Auto-Inferred)' : ''} &bull; {mlReport.train_samples} train / {mlReport.test_samples} test rows (80/20 holdout)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="badge badge-green" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <ShieldCheck size={12} /> 0% Leakage Guard
                  </span>
                  <button
                    onClick={handleRunMlBenchmark}
                    disabled={mlLoading}
                    className="btn btn-xs btn-ghost"
                    style={{ fontSize: '0.72rem', color: 'var(--cyan-primary, #06b6d4)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    {mlLoading ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />}
                    {mlLoading ? 'Evaluating...' : 'Re-Benchmark'}
                  </button>
                </div>
              </div>

              {/* Metric Comparison Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.65rem',
                marginBottom: '0.85rem',
              }}>
                {/* Headline Metric */}
                <div style={{ background: 'var(--bg-surface)', padding: '0.75rem 0.9rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      {mlReport.primary_metric_name}
                    </span>
                    <span
                      className={`badge ${mlReport.primary_improved ? 'badge-green' : 'badge-rose'}`}
                      style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      {mlReport.primary_improved ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {mlReport.primary_improvement_pct >= 0 ? `+${mlReport.primary_improvement_pct.toFixed(1)}%` : `${mlReport.primary_improvement_pct.toFixed(1)}%`}
                    </span>
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700, color: mlReport.primary_improved ? 'var(--emerald-primary)' : 'var(--text-primary)', marginTop: '0.2rem' }}>
                    {typeof mlReport.primary_cleaned_score === 'number' ? mlReport.primary_cleaned_score.toFixed(3) : mlReport.primary_cleaned_score}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Raw baseline: <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{typeof mlReport.primary_raw_score === 'number' ? mlReport.primary_raw_score.toFixed(3) : mlReport.primary_raw_score}</span>
                  </div>
                </div>

                {/* Secondary Metrics */}
                {mlReport.metrics.filter(m => m.metric_name !== mlReport.primary_metric_name).slice(0, 2).map((m, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-surface)', padding: '0.75rem 0.9rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        {m.metric_name}
                      </span>
                      <span
                        className={`badge ${m.is_improved ? 'badge-green' : 'badge-muted'}`}
                        style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                      >
                        {m.is_improved ? <TrendingUp size={10} /> : null}
                        {m.percent_change >= 0 ? `+${m.percent_change.toFixed(1)}%` : `${m.percent_change.toFixed(1)}%`}
                      </span>
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: m.is_improved ? 'var(--emerald-primary)' : 'var(--text-primary)', marginTop: '0.2rem' }}>
                      {typeof m.cleaned_score === 'number' ? m.cleaned_score.toFixed(3) : m.cleaned_score}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      Raw baseline: <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{typeof m.raw_score === 'number' ? m.raw_score.toFixed(3) : m.raw_score}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Top Predictive Features */}
              {mlReport.top_features && mlReport.top_features.length > 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Top Predictive Features:</span>
                  {mlReport.top_features.slice(0, 4).map((f, idx) => (
                    <span key={idx} className="badge badge-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      {f.feature}: {Math.round(f.importance * 100)}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Prompt to benchmark if not yet evaluated for supervised task */}
          {!mlReport && !mlLoading && (['REGRESSION', 'LINEAR_REGRESSION', 'CONTINUOUS_REGRESSION', 'POLYNOMIAL_REGRESSION', 'CLASSIFICATION', 'BINARY_CLASSIFICATION', 'MULTICLASS_CLASSIFICATION', 'LOGISTIC_REGRESSION'].includes(taskType)) && (
            <div style={{
              background: 'var(--bg-subtle)',
              border: '1px dashed var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Brain size={15} color="var(--cyan-primary, #06b6d4)" />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Ready to test ML readiness for <strong>{taskType}</strong> with zero target leakage.
                </span>
              </div>
              <button
                onClick={handleRunMlBenchmark}
                disabled={mlLoading}
                className="btn btn-xs btn-outline"
                style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                {mlLoading ? <Loader2 size={11} className="spin" /> : <Brain size={11} />}
                Benchmark ML Readiness
              </button>
            </div>
          )}

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
