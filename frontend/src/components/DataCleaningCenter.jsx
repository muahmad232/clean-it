import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  Bot,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Cpu,
  ArrowRight,
  Download,
  Check,
  ChevronDown,
  ChevronUp,
  Zap,
  Sliders,
  FileCheck,
  Terminal,
  History,
  RotateCcw,
  Layers,
  Lock,
  Calendar,
} from 'lucide-react'
import {
  cleanDataset,
  runAgenticCleaning,
  analyzeDatasetWithLlm,
  getDownloadUrl,
  fetchDatasetVersions,
  rollbackDatasetVersion,
  getVersionDownloadUrl,
} from '../api'

export default function DataCleaningCenter({
  dataset,
  projectId,
  profile,
  issues = [],
  taskType = 'GENERAL',
  onDatasetCleaned,
}) {
  // Cleaning Mode: 'agent_loop' | 'instant_deterministic' | 'diagnostic_only' | 'version_history'
  const [activeMode, setActiveMode] = useState('agent_loop')

  // Common Configuration
  const [selectedTask, setSelectedTask] = useState(taskType || dataset?.task_type || 'GENERAL')
  const [targetColumn, setTargetColumn] = useState(dataset?.target_column || '')

  // Phase 11: Versioning & Rollback State
  const [versionsList, setVersionsList] = useState([])
  const [currentVersion, setCurrentVersion] = useState(null)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState(null)
  const [rollbackLoading, setRollbackLoading] = useState(false)
  const [rollbackSuccess, setRollbackSuccess] = useState(null)
  const [rollbackError, setRollbackError] = useState(null)
  const [rollbackConfirmVersion, setRollbackConfirmVersion] = useState(null)

  // AI Agent Loop Configuration & State
  const [maxIterations, setMaxIterations] = useState(3)
  const [agentResult, setAgentResult] = useState(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState(null)
  const [expandedStep, setExpandedStep] = useState(1)

  // Instant Deterministic State
  const [instantReport, setInstantReport] = useState(
    profile?.cleaning_report || dataset?.profile_json?.cleaning_report || null
  )
  const [instantLoading, setInstantLoading] = useState(false)
  const [instantError, setInstantError] = useState(null)
  const [lastInstantCleanedAt, setLastInstantCleanedAt] = useState(null)

  // Read-only Diagnostic State
  const [diagnosticData, setDiagnosticData] = useState(null)
  const [diagnosticLoading, setDiagnosticLoading] = useState(false)
  const [diagnosticError, setDiagnosticError] = useState(null)

  const columns = profile?.columns?.map((c) => c.name) || []

  // Load version lineage
  const loadVersions = async () => {
    if (!dataset?.id) return
    setVersionsLoading(true)
    setVersionsError(null)
    try {
      const data = await fetchDatasetVersions(projectId || dataset.project_id, dataset.id)
      setVersionsList(data.versions || [])
      setCurrentVersion(data.current_version || null)
    } catch (err) {
      console.warn('Could not fetch dataset versions:', err)
      setVersionsError(err.message || 'Could not fetch version history.')
    } finally {
      setVersionsLoading(false)
    }
  }

  useEffect(() => {
    loadVersions()
  }, [dataset?.id])

  // ── Handler 1: Autonomous Multi-Step AI Agent Cleaning Loop ───────
  const handleRunAgentLoop = async () => {
    if (!dataset?.id) return
    setAgentLoading(true)
    setAgentError(null)

    try {
      const res = await runAgenticCleaning(
        projectId || dataset.project_id,
        dataset.id,
        selectedTask,
        targetColumn.trim() || null,
        maxIterations
      )
      setAgentResult(res)
      if (res?.report?.steps && res.report.steps.length > 0) {
        setExpandedStep(res.report.steps.length)
      }
      if (res?.version) {
        setCurrentVersion(res.version)
      }
      if (onDatasetCleaned) {
        onDatasetCleaned(res)
      }
      await loadVersions()
    } catch (err) {
      console.error('Agent clean loop failed:', err)
      setAgentError(err.message || 'Agent cleaning loop encountered an error.')
    } finally {
      setAgentLoading(false)
    }
  }

  // ── Handler 2: Instant Deterministic Cleaning (Heuristic, 0s) ─────
  const handleRunInstantClean = async () => {
    if (!dataset?.id) return
    setInstantLoading(true)
    setInstantError(null)

    try {
      const res = await cleanDataset(
        projectId || dataset.project_id,
        dataset.id,
        selectedTask,
        targetColumn.trim() || null
      )
      setInstantReport(res.report)
      setLastInstantCleanedAt(new Date().toLocaleTimeString())
      if (onDatasetCleaned) {
        onDatasetCleaned(res)
      }
      await loadVersions()
    } catch (err) {
      console.error('Instant clean failed:', err)
      setInstantError(err.message || 'Instant deterministic cleaning failed.')
    } finally {
      setInstantLoading(false)
    }
  }

  // ── Handler 4: Rollback Dataset Version (Phase 11) ─────────────────
  const handleRollback = async (targetVersionId = null, targetVersionNumber = null) => {
    if (!dataset?.id) return
    setRollbackLoading(true)
    setRollbackError(null)
    setRollbackSuccess(null)
    try {
      const res = await rollbackDatasetVersion(
        projectId || dataset.project_id,
        dataset.id,
        targetVersionId,
        `Rollback to v${targetVersionNumber ?? 'parent'}`
      )
      setRollbackSuccess(res.message || `Successfully rolled back to version v${res.current_version}.`)
      setRollbackConfirmVersion(null)
      await loadVersions()
      if (onDatasetCleaned) {
        onDatasetCleaned({
          ...res,
          status: res.current_version === 0 ? 'UPLOADED' : 'CLEANED',
          is_rollback: true,
        })
      }
    } catch (err) {
      console.error('Rollback failed:', err)
      setRollbackError(err.message || 'Rollback rejected.')
    } finally {
      setRollbackLoading(false)
    }
  }

  // ── Handler 3: Diagnostic Reasoning Only ──────────────────────────
  const handleRunDiagnostic = async () => {
    setDiagnosticLoading(true)
    setDiagnosticError(null)
    try {
      const res = await analyzeDatasetWithLlm({
        datasetName: dataset?.original_filename || 'Dataset',
        taskType: selectedTask,
        rowCount: profile?.row_count || profile?.shape?.rows || 0,
        columnCount: profile?.column_count || profile?.shape?.columns || 0,
        duplicateRows: profile?.duplicate_rows || profile?.duplicate_row_count || 0,
        llmSummary: profile?.llm_summary || '',
        issues: issues,
      })
      setDiagnosticData(res)
    } catch (err) {
      console.error('Diagnostic failed:', err)
      setDiagnosticError(err.message || 'Diagnostic reasoning failed.')
    } finally {
      setDiagnosticLoading(false)
    }
  }

  const downloadUrl = getDownloadUrl(projectId || dataset?.project_id, dataset?.id)
  const isAnyCleaningActive = agentLoading || instantLoading || diagnosticLoading

  const getGradeColor = (grade = '') => {
    const g = String(grade).toUpperCase()
    if (g.startsWith('A')) return 'var(--emerald-primary)'
    if (g.startsWith('B')) return '#38bdf8'
    if (g.startsWith('C')) return '#f59e0b'
    return '#f43f5e'
  }

  const getActionBadgeClass = (actionType = '') => {
    switch (actionType.toLowerCase()) {
      case 'remove_duplicates':
      case 'trim_whitespace':
        return 'badge-muted'
      case 'impute_missing':
      case 'fix_type_mismatches':
        return 'badge-green'
      case 'drop_surrogate_identifiers':
      case 'drop_high_null_columns':
      case 'drop_constant_columns':
      case 'drop_columns':
        return 'badge-amber'
      default:
        return 'badge-muted'
    }
  }

  return (
    <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid var(--border-medium)' }}>
      {/* ── Section Header ───────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '1rem',
        paddingBottom: '0.85rem',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{
            background: 'var(--bg-subtle)',
            padding: '0.45rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-medium)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Bot size={18} color="var(--text-primary)" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              Data Cleaning & Export Center
              <span className="badge badge-muted" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Layers size={11} /> v{currentVersion?.version_number ?? 0}
              </span>
              {(agentResult || instantReport) && (
                <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                  <Check size={11} /> Cleaned
                </span>
              )}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
              Autonomous multi-turn AI reasoning, instant deterministic heuristic cleaning, and reversible version rollback.
            </p>
          </div>
        </div>

        {/* Clean Mode Switcher Tabs */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-main)',
          padding: '0.2rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
          gap: '0.2rem',
        }}>
          <button
            onClick={() => setActiveMode('agent_loop')}
            className={`btn btn-xs ${activeMode === 'agent_loop' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
          >
            <Sparkles size={12} /> Autonomous AI Loop
          </button>
          <button
            onClick={() => setActiveMode('instant_deterministic')}
            className={`btn btn-xs ${activeMode === 'instant_deterministic' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
          >
            <Zap size={12} /> Instant Standard Clean
          </button>
          <button
            onClick={() => setActiveMode('diagnostic_only')}
            className={`btn btn-xs ${activeMode === 'diagnostic_only' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
          >
            <Terminal size={12} /> Read-Only Diagnostic
          </button>
          <button
            onClick={() => setActiveMode('version_history')}
            className={`btn btn-xs ${activeMode === 'version_history' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
          >
            <History size={12} /> History & Rollback ({versionsList.length || 1})
          </button>
        </div>
      </div>

      {/* ── Configuration Parameters Grid ─────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.75rem',
        background: 'var(--bg-main)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
        alignItems: 'end',
      }}>
        {/* ML Task Selector */}
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 500 }}>
            Target Optimization Task
          </label>
          <select
            value={selectedTask}
            onChange={(e) => setSelectedTask(e.target.value)}
            disabled={isAnyCleaningActive}
            className="select-input"
            style={{
              width: '100%',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-medium)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.35rem 0.6rem',
              fontSize: '0.8rem',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="GENERAL">General Clean (Universal)</option>
            <option value="CLASSIFICATION">Classification (Drop Identifiers / Leakage)</option>
            <option value="REGRESSION">Regression (Median Impute & Outliers)</option>
            <option value="LLM_FINETUNING">LLM Fine-tuning (Whitespace & Formatting)</option>
            <option value="CLUSTERING">Clustering (Drop High Nulls & Constant)</option>
          </select>
        </div>

        {/* Target Column (Protected from drop) */}
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 500 }}>
            Protected Target Column
          </label>
          {columns.length > 0 ? (
            <select
              value={targetColumn}
              onChange={(e) => setTargetColumn(e.target.value)}
              disabled={isAnyCleaningActive}
              className="select-input"
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.35rem 0.6rem',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">-- None (Protect All) --</option>
              {columns.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="e.g. Survived, Churn"
              value={targetColumn}
              onChange={(e) => setTargetColumn(e.target.value)}
              disabled={isAnyCleaningActive}
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.35rem 0.6rem',
                fontSize: '0.8rem',
                outline: 'none',
              }}
            />
          )}
        </div>

        {/* AI Loop Iterations (Only visible in agent_loop mode) */}
        {activeMode === 'agent_loop' && (
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 500 }}>
              Max Agent Iterations
            </label>
            <select
              value={maxIterations}
              onChange={(e) => setMaxIterations(Number(e.target.value))}
              disabled={isAnyCleaningActive}
              className="select-input"
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.35rem 0.6rem',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value={2}>2 Iterations</option>
              <option value={3}>3 Iterations (Recommended)</option>
              <option value={4}>4 Iterations</option>
              <option value={5}>5 Iterations (Deep Cleanup)</option>
            </select>
          </div>
        )}

        {/* Action Button */}
        <div>
          {activeMode === 'agent_loop' && (
            <button
              onClick={handleRunAgentLoop}
              disabled={isAnyCleaningActive}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.45rem 0.85rem',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
              }}
            >
              {agentLoading ? (
                <>
                  <Loader2 size={14} className="spin" />
                  Agent Iterating...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Run Autonomous Loop
                </>
              )}
            </button>
          )}

          {activeMode === 'instant_deterministic' && (
            <button
              onClick={handleRunInstantClean}
              disabled={isAnyCleaningActive}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.45rem 0.85rem',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
              }}
            >
              {instantLoading ? (
                <>
                  <Loader2 size={14} className="spin" />
                  Cleaning...
                </>
              ) : (
                <>
                  <Zap size={14} />
                  Run Instant Clean (0s)
                </>
              )}
            </button>
          )}

          {activeMode === 'diagnostic_only' && (
            <button
              onClick={handleRunDiagnostic}
              disabled={isAnyCleaningActive}
              className="btn btn-secondary"
              style={{
                width: '100%',
                padding: '0.45rem 0.85rem',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
              }}
            >
              {diagnosticLoading ? (
                <>
                  <Loader2 size={14} className="spin" />
                  Reasoning...
                </>
              ) : (
                <>
                  <Bot size={14} />
                  Generate Diagnosis
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Safety & Protocol Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem',
        fontSize: '0.72rem',
        color: 'var(--text-muted)',
        marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <ShieldCheck size={13} color="var(--emerald-primary)" />
          <span>
            {activeMode === 'agent_loop'
              ? 'Agent Loop: Qwen 3.8 27B plans tool actions &rarr; Polars executes deterministically &rarr; Re-profiles.'
              : activeMode === 'instant_deterministic'
              ? 'Instant Mode: Pure deterministic Polars transformations (0 tokens consumed, runs in 5ms).'
              : 'Diagnostic Mode: Compact fingerprint analyzed for defect impact (read-only, no modifications).'}
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)' }}>
          Retention: 10-day auto-purge
        </div>
      </div>

      {/* Error Banners */}
      {(agentError || instantError || diagnosticError) && (
        <div style={{
          background: 'var(--rose-bg)',
          border: '1px solid var(--rose-border)',
          color: 'var(--rose-primary)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.75rem 1rem',
          fontSize: '0.825rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <AlertTriangle size={15} />
          <span>{agentError || instantError || diagnosticError}</span>
        </div>
      )}

      {/* ── Active Loading Animations ─────────────────────────────── */}
      {agentLoading && (
        <div style={{
          background: 'var(--bg-main)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '1.75rem',
          textAlign: 'center',
          marginBottom: '1rem',
        }}>
          <Loader2 size={26} className="spin" style={{ color: 'var(--text-secondary)', margin: '0 auto 0.75rem' }} />
          <div style={{ fontSize: '0.925rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
            Groq Agent Executing Multi-Step Cleaning Loop...
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', maxWidth: '540px', margin: '0 auto' }}>
            Analyzing Polars profiling deltas &rarr; Choosing deterministic transformation functions &rarr;
            Re-profiling &rarr; Iterating until all detected anomalies are resolved.
          </p>
        </div>
      )}

      {instantLoading && (
        <div style={{
          background: 'var(--bg-main)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '1.5rem',
          textAlign: 'center',
          marginBottom: '1rem',
        }}>
          <Loader2 size={24} className="spin" style={{ color: 'var(--text-secondary)', margin: '0 auto 0.5rem' }} />
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Applying Instant Polars Transformations...
          </div>
        </div>
      )}

      {/* ── VIEW 1: AGENT LOOP RESULTS (When completed) ───────────── */}
      {agentResult && !agentLoading && (
        <div style={{ marginBottom: '1rem' }}>
          {/* Top Banner: Success + Download Button */}
          <div style={{
            background: 'var(--bg-main)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '1rem 1.25rem',
            marginBottom: '1rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={18} color="var(--emerald-primary)" />
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Autonomous AI Cleaning Complete ({agentResult.report?.total_iterations} Iteration{agentResult.report?.total_iterations > 1 ? 's' : ''})
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Resolved {agentResult.report?.issues_resolved || 0} defect(s) across {agentResult.report?.steps?.length || 0} agentic cycle(s).
                  </p>
                </div>
              </div>

              {/* Direct Download Cleaned CSV & Version Indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setActiveMode('version_history')}
                  className="btn btn-xs btn-outline"
                  style={{
                    fontSize: '0.78rem',
                    padding: '0.35rem 0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    border: '1px solid var(--border-medium)',
                  }}
                  title="View this snapshot in History & Rollback timeline"
                >
                  <Layers size={13} color="var(--emerald-primary)" />
                  <span>Version v{currentVersion?.version_number ?? (agentResult.version?.version_number ?? 1)}</span>
                </button>

                <a
                  href={downloadUrl}
                  download
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                >
                  <Download size={13} /> Download Cleaned CSV
                </a>
              </div>
            </div>

            {/* Before vs After Metric Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '0.65rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--border-subtle)',
            }}>
              <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Health Grade</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: getGradeColor(agentResult.report?.final_metrics?.health_grade) }}>
                  {agentResult.report?.final_metrics?.health_grade || 'A'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Readiness</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {agentResult.report?.final_metrics?.readiness_score || 95}%
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dimensions</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {agentResult.report?.initial_metrics?.rows}x{agentResult.report?.initial_metrics?.columns}
                  <span style={{ color: 'var(--text-muted)', margin: '0 0.25rem' }}>&rarr;</span>
                  {agentResult.report?.final_metrics?.rows}x{agentResult.report?.final_metrics?.columns}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Missingness</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {agentResult.report?.initial_metrics?.total_null_pct}%
                  <span style={{ color: 'var(--text-muted)', margin: '0 0.25rem' }}>&rarr;</span>
                  <span style={{ color: 'var(--emerald-primary)' }}>{agentResult.report?.final_metrics?.total_null_pct}%</span>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Defects</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {agentResult.report?.initial_metrics?.issues_count}
                  <span style={{ color: 'var(--text-muted)', margin: '0 0.25rem' }}>&rarr;</span>
                  <span style={{ color: agentResult.report?.final_metrics?.issues_count === 0 ? 'var(--emerald-primary)' : 'var(--amber-primary)' }}>
                    {agentResult.report?.final_metrics?.issues_count} remaining
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Multi-Step Agentic Audit Trail Accordion */}
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
              Multi-Step Agentic Audit Trail
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {agentResult.report?.steps?.map((step) => {
                const isExpanded = expandedStep === step.iteration
                return (
                  <div
                    key={step.iteration}
                    style={{
                      background: 'var(--bg-main)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      onClick={() => setExpandedStep(isExpanded ? null : step.iteration)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        userSelect: 'none',
                        background: isExpanded ? 'var(--bg-subtle)' : 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-medium)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {step.iteration}
                        </div>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            Iteration {step.iteration}: {step.is_dataset_clean ? 'Verification & Clean State' : `Executed ${step.selected_actions?.length || 0} Action(s)`}
                          </span>
                          <span style={{ marginLeft: '0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            ({step.pre_shape?.rows}x{step.pre_shape?.columns} &bull; Grade {step.health_grade})
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {step.is_dataset_clean ? (
                          <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                            Clean Verified
                          </span>
                        ) : (
                          <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>
                            Executed
                          </span>
                        )}
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '0.9rem 1rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.8rem' }}>
                        <div style={{ marginBottom: '0.75rem' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                            LLM Agent Reasoning
                          </div>
                          <p style={{ color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                            {step.llm_assessment}
                          </p>
                          {step.stopping_reason && (
                            <p style={{ color: 'var(--emerald-primary)', marginTop: '0.35rem', fontWeight: 500 }}>
                              Stopping Reason: {step.stopping_reason}
                            </p>
                          )}
                        </div>

                        {step.selected_actions && step.selected_actions.length > 0 && (
                          <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                              Functions Executed on Dataset
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {step.selected_actions.map((act, aIdx) => {
                                const execRes = step.execution_results?.[aIdx]
                                return (
                                  <div
                                    key={aIdx}
                                    style={{
                                      background: 'var(--bg-surface)',
                                      border: '1px solid var(--border-subtle)',
                                      borderRadius: 'var(--radius-sm)',
                                      padding: '0.6rem 0.8rem',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                      <span className={`badge ${getActionBadgeClass(act.action_type)}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                                        {act.action_type}
                                      </span>
                                      {act.target_columns && act.target_columns.length > 0 && (
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                          target: [{act.target_columns.join(', ')}]
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                                      <strong>Reasoning:</strong> {act.reasoning}
                                    </div>
                                    {execRes && (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--emerald-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <ArrowRight size={11} />
                                        <span>Polars Result: {execRes.details}</span>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW 2: INSTANT CLEAN RESULTS (When completed) ────────── */}
      {instantReport && !instantLoading && (
        <div style={{
          background: 'var(--bg-main)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '1.25rem',
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={18} color="var(--emerald-primary)" />
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                  Deterministic Clean Complete (Polars)
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {lastInstantCleanedAt ? `Cleaned at ${lastInstantCleanedAt}` : 'Ready for download'}
                </p>
              </div>
            </div>

            {/* Direct Download Cleaned CSV & Version Indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setActiveMode('version_history')}
                className="btn btn-xs btn-outline"
                style={{
                  fontSize: '0.78rem',
                  padding: '0.35rem 0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  border: '1px solid var(--border-medium)',
                }}
                title="View this snapshot in History & Rollback timeline"
              >
                <Layers size={13} color="var(--emerald-primary)" />
                <span>Version v{currentVersion?.version_number ?? 1}</span>
              </button>

              <a
                href={downloadUrl}
                download
                className="btn btn-primary btn-sm"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
              >
                <Download size={13} /> Download Cleaned CSV
              </a>
            </div>
          </div>

          {/* Transformation Delta Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {instantReport.duplicates_removed > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Check size={13} color="var(--emerald-primary)" />
                <span>Removed {instantReport.duplicates_removed} duplicate row(s).</span>
              </div>
            )}
            {instantReport.identifiers_dropped?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Check size={13} color="var(--emerald-primary)" />
                <span>Dropped surrogate key identifier(s): {instantReport.identifiers_dropped.join(', ')}.</span>
              </div>
            )}
            {instantReport.constant_columns_dropped?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Check size={13} color="var(--emerald-primary)" />
                <span>Dropped constant column(s): {instantReport.constant_columns_dropped.join(', ')}.</span>
              </div>
            )}
            {instantReport.high_null_columns_dropped?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Check size={13} color="var(--emerald-primary)" />
                <span>Dropped catastrophic null column(s): {instantReport.high_null_columns_dropped.join(', ')}.</span>
              </div>
            )}
            {instantReport.type_casts?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Check size={13} color="var(--emerald-primary)" />
                <span>Fixed type mismatch(es): {instantReport.type_casts.join('; ')}.</span>
              </div>
            )}
            {instantReport.imputed_nulls && Object.keys(instantReport.imputed_nulls).length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                <Check size={13} color="var(--emerald-primary)" style={{ marginTop: '0.15rem' }} />
                <span>
                  Imputed missing values: {Object.entries(instantReport.imputed_nulls).map(([col, text]) => `${col} (${text})`).join('; ')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── VIEW 3: READ-ONLY DIAGNOSTIC RESULTS ──────────────────── */}
      {diagnosticData && !diagnosticLoading && (
        <div style={{
          background: 'var(--bg-main)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '1rem 1.25rem',
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem' }}>
            <div style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: getGradeColor(diagnosticData.insights?.health_grade),
              fontFamily: 'var(--font-mono)',
            }}>
              Grade {diagnosticData.insights?.health_grade} ({diagnosticData.insights?.readiness_score}% ML-Ready)
            </div>
          </div>
          <p style={{ color: 'var(--text-primary)', fontSize: '0.825rem', lineHeight: 1.5, margin: '0 0 0.75rem' }}>
            {diagnosticData.insights?.executive_summary}
          </p>

          {diagnosticData.insights?.defect_evaluations?.map((d, i) => (
            <div
              key={i}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.65rem 0.85rem',
                fontSize: '0.78rem',
                marginBottom: '0.4rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.defect_title}</span>
                <span className="badge badge-muted">{d.severity}</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                {d.impact_explanation}
              </div>
              <div style={{ color: 'var(--emerald-primary)' }}>
                &rarr; Recommended: {d.recommended_action}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── VIEW 4: DATASET VERSIONING & REVERSIBLE ROLLBACK (PHASE 11) ── */}
      {activeMode === 'version_history' && (
        <div style={{
          background: 'var(--bg-main)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '1.25rem',
          marginBottom: '1rem',
        }}>
          {/* Header & Controls */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1rem',
            paddingBottom: '0.85rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                  Dataset Version Lineage & Recovery
                </span>
                <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>
                  {versionsList.length} snapshot{versionsList.length === 1 ? '' : 's'}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', margin: 0 }}>
                Every transformation batch generates an immutable columnar Parquet & CSV snapshot. Roll back to any prior state safely without destructive data loss.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={loadVersions}
                disabled={versionsLoading}
                className="btn btn-xs btn-outline"
                style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <RefreshCw size={11} className={versionsLoading ? 'spin' : ''} />
                Refresh Lineage
              </button>

              {/* Quick Rollback to Parent if current > 0 */}
              {currentVersion && currentVersion.version_number > 0 && (
                <button
                  onClick={() => setRollbackConfirmVersion({
                    id: currentVersion.parent_version_id || null,
                    version_number: currentVersion.version_number - 1,
                    created_by_action: 'Parent Version (v' + (currentVersion.version_number - 1) + ')',
                  })}
                  disabled={rollbackLoading}
                  className="btn btn-xs btn-primary"
                  style={{
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: 'var(--amber-primary, #f59e0b)',
                    borderColor: 'var(--amber-primary, #f59e0b)',
                    color: '#000',
                  }}
                >
                  <RotateCcw size={11} />
                  Revert to Parent (v{currentVersion.version_number - 1})
                </button>
              )}
            </div>
          </div>

          {/* Rollback Confirmation Modal / Card */}
          {rollbackConfirmVersion && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid var(--amber-primary, #f59e0b)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--amber-primary, #f59e0b)' }}>
                <AlertTriangle size={16} />
                <span style={{ fontWeight: 600, fontSize: '0.84rem' }}>
                  Confirm Reversible Rollback to Version v{rollbackConfirmVersion.version_number}
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-primary)', margin: 0 }}>
                This will switch the active dataset working state to snapshot <strong>v{rollbackConfirmVersion.version_number}</strong> ({rollbackConfirmVersion.created_by_action || rollbackConfirmVersion.action_title || 'Historical Snapshot'}). All metrics, active files, and downloads will reflect this version. Subsequent transformations will branch from this state.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                <button
                  onClick={() => handleRollback(rollbackConfirmVersion.id, rollbackConfirmVersion.version_number)}
                  disabled={rollbackLoading}
                  className="btn btn-xs btn-primary"
                  style={{
                    background: 'var(--amber-primary, #f59e0b)',
                    borderColor: 'var(--amber-primary, #f59e0b)',
                    color: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  {rollbackLoading ? <Loader2 size={12} className="spin" /> : <RotateCcw size={12} />}
                  Confirm Rollback
                </button>
                <button
                  onClick={() => setRollbackConfirmVersion(null)}
                  disabled={rollbackLoading}
                  className="btn btn-xs btn-ghost"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Success / Error Banners */}
          {rollbackSuccess && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid var(--emerald-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.65rem 0.85rem',
              marginBottom: '1rem',
              fontSize: '0.78rem',
              color: 'var(--emerald-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <CheckCircle2 size={14} />
                <span>{rollbackSuccess}</span>
              </div>
              <button
                onClick={() => setRollbackSuccess(null)}
                style={{ background: 'none', border: 'none', color: 'var(--emerald-primary)', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                &times;
              </button>
            </div>
          )}

          {rollbackError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              borderRadius: 'var(--radius-sm)',
              padding: '0.65rem 0.85rem',
              marginBottom: '1rem',
              fontSize: '0.78rem',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <AlertTriangle size={14} />
                <span>{rollbackError}</span>
              </div>
              <button
                onClick={() => setRollbackError(null)}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                &times;
              </button>
            </div>
          )}

          {/* Loading Indicator */}
          {versionsLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 0', gap: '0.65rem', color: 'var(--text-secondary)' }}>
              <Loader2 size={18} className="spin" />
              <span style={{ fontSize: '0.8rem' }}>Loading dataset version lineage...</span>
            </div>
          )}

          {/* Version Lineage Timeline (Newest first) */}
          {!versionsLoading && versionsList.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No version snapshots found. Run an Instant Clean or Autonomous Agent cycle to produce version v1.
            </div>
          )}

          {!versionsLoading && versionsList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[...versionsList].sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0)).map((v, idx) => {
                const isCurrent = v.is_current || (currentVersion?.id === v.id) || (currentVersion?.version_number === v.version_number)
                const isRoot = v.version_number === 0
                const metrics = v.metrics_json || {}
                const createdAt = v.created_at ? new Date(v.created_at).toLocaleString() : 'Initial Ingest'

                return (
                  <div
                    key={v.id || idx}
                    style={{
                      background: isCurrent ? 'var(--bg-surface)' : 'var(--bg-main)',
                      border: isCurrent ? '1px solid var(--emerald-primary)' : '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                      position: 'relative',
                    }}
                  >
                    {/* Top Row: Version Badge, Action Name, Created At */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span
                          className={`badge ${isCurrent ? 'badge-green' : isRoot ? 'badge-muted' : 'badge-amber'}`}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                          }}
                        >
                          {isRoot ? <Lock size={10} /> : <Layers size={10} />}
                          v{v.version_number}
                        </span>

                        <span style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                          {v.created_by_action || (isRoot ? 'Initial Ingest (v0 Original)' : 'Transformation Batch')}
                        </span>

                        {isCurrent && (
                          <span className="badge badge-green" style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Check size={10} /> Active State
                          </span>
                        )}

                        {isRoot && (
                          <span className="badge badge-muted" style={{ fontSize: '0.68rem' }}>
                            Immutable
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Calendar size={11} />
                        {createdAt}
                      </div>
                    </div>

                    {/* Metrics Row */}
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      background: 'var(--bg-subtle)',
                      padding: '0.45rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Rows: </span>
                        <strong style={{ color: 'var(--text-primary)' }}>{metrics.rows !== undefined ? metrics.rows.toLocaleString() : '—'}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Columns: </span>
                        <strong style={{ color: 'var(--text-primary)' }}>{metrics.columns !== undefined ? metrics.columns : '—'}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Null Rate: </span>
                        <strong style={{ color: metrics.total_null_pct > 0 ? '#f59e0b' : 'var(--emerald-primary)' }}>
                          {metrics.total_null_pct !== undefined ? `${metrics.total_null_pct}%` : '0%'}
                        </strong>
                      </div>
                      {metrics.duplicate_rows_removed !== undefined && metrics.duplicate_rows_removed > 0 && (
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Duplicates Dropped: </span>
                          <strong style={{ color: 'var(--emerald-primary)' }}>{metrics.duplicate_rows_removed}</strong>
                        </div>
                      )}
                      {v.parent_version_id && (
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Parent: </span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {v.parent_version_id.length > 8 ? `...${v.parent_version_id.slice(-6)}` : v.parent_version_id}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Row: Download & Rollback Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.2rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <a
                          href={getVersionDownloadUrl(projectId || dataset.project_id, dataset.id, v.version_number, 'csv')}
                          download
                          className="btn btn-xs btn-outline"
                          style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          <Download size={11} /> CSV
                        </a>
                        <a
                          href={getVersionDownloadUrl(projectId || dataset.project_id, dataset.id, v.version_number, 'parquet')}
                          download
                          className="btn btn-xs btn-outline"
                          style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          <Download size={11} /> Parquet
                        </a>
                      </div>

                      <div>
                        {isCurrent ? (
                          <span style={{ fontSize: '0.72rem', color: 'var(--emerald-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Check size={12} /> Currently Active
                          </span>
                        ) : (
                          <button
                            onClick={() => setRollbackConfirmVersion(v)}
                            disabled={rollbackLoading}
                            className="btn btn-xs btn-ghost"
                            style={{
                              fontSize: '0.72rem',
                              border: '1px solid var(--border-medium)',
                              color: 'var(--text-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                          >
                            <RotateCcw size={11} color="var(--amber-primary, #f59e0b)" />
                            Revert to v{v.version_number}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
