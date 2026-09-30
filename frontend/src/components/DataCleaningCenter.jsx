import React, { useState } from 'react'
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
} from 'lucide-react'
import { cleanDataset, runAgenticCleaning, analyzeDatasetWithLlm, getDownloadUrl } from '../api'

export default function DataCleaningCenter({
  dataset,
  projectId,
  profile,
  issues = [],
  taskType = 'GENERAL',
  onDatasetCleaned,
}) {
  // Cleaning Mode: 'agent_loop' | 'instant_deterministic' | 'diagnostic_only'
  const [activeMode, setActiveMode] = useState('agent_loop')

  // Common Configuration
  const [selectedTask, setSelectedTask] = useState(taskType || dataset?.task_type || 'GENERAL')
  const [targetColumn, setTargetColumn] = useState(dataset?.target_column || '')

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
      if (onDatasetCleaned) {
        onDatasetCleaned(res)
      }
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
    } catch (err) {
      console.error('Instant clean failed:', err)
      setInstantError(err.message || 'Instant deterministic cleaning failed.')
    } finally {
      setInstantLoading(false)
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
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Data Cleaning & Export Center
              {(agentResult || instantReport) && (
                <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                  <Check size={11} /> Cleaned
                </span>
              )}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
              Choose between autonomous multi-turn AI reasoning or instant deterministic heuristic cleaning.
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

              {/* Direct Download Cleaned CSV */}
              <a
                href={downloadUrl}
                download
                className="btn btn-primary btn-sm"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
              >
                <Download size={13} /> Download Cleaned CSV
              </a>
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

            <a
              href={downloadUrl}
              download
              className="btn btn-primary btn-sm"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
            >
              <Download size={13} /> Download Cleaned CSV
            </a>
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
    </div>
  )
}
