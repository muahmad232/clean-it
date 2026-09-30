import React, { useState } from 'react'
import {
  Sparkles,
  Bot,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  RefreshCw,
  Cpu,
  ArrowRight,
  Download,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  Wand2,
  Sliders,
} from 'lucide-react'
import { analyzeDatasetWithLlm, runAgenticCleaning, getDownloadUrl } from '../api'

export default function AiInsightsCard({
  dataset,
  projectId,
  profile,
  issues = [],
  taskType = 'GENERAL',
  onDatasetCleaned,
}) {
  const [activeMode, setActiveMode] = useState('agent_clean') // 'agent_clean' | 'diagnostic'
  const [selectedTask, setSelectedTask] = useState(taskType || 'GENERAL')
  const [targetColumn, setTargetColumn] = useState('')
  const [maxIterations, setMaxIterations] = useState(3)

  // Fast Diagnostic state
  const [diagnosticData, setDiagnosticData] = useState(null)
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false)
  const [diagnosticError, setDiagnosticError] = useState(null)

  // Autonomous Agent Cleaning Loop state
  const [agentResult, setAgentResult] = useState(null)
  const [cleaningActive, setCleaningActive] = useState(false)
  const [cleaningError, setCleaningError] = useState(null)
  const [expandedStep, setExpandedStep] = useState(1)

  // 1. Fast Diagnostic Handler
  const handleGenerateDiagnostic = async () => {
    setLoadingDiagnostic(true)
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
      console.error('Diagnostic error:', err)
      setDiagnosticError(err.message || 'Diagnostic failed.')
    } finally {
      setLoadingDiagnostic(false)
    }
  }

  // 2. Autonomous Multi-Step Agentic Cleaning Loop Handler
  const handleRunAutonomousCleaning = async () => {
    if (!dataset?.id) {
      alert('Please upload or select a dataset first.')
      return
    }
    setCleaningActive(true)
    setCleaningError(null)

    try {
      const res = await runAgenticCleaning(
        projectId || dataset.project_id,
        dataset.id,
        selectedTask,
        targetColumn.trim() || null,
        maxIterations
      )
      setAgentResult(res)
      if (res?.steps && res.steps.length > 0) {
        setExpandedStep(res.steps.length)
      }
      // Notify parent to live-update profile & issues in Studio!
      if (onDatasetCleaned && res?.final_profile) {
        onDatasetCleaned(res)
      }
    } catch (err) {
      console.error('Autonomous agent clean error:', err)
      setCleaningError(err.message || 'Agent cleaning cycle failed.')
    } finally {
      setCleaningActive(false)
    }
  }

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
      {/* Top Header Bar */}
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
            padding: '0.5rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-medium)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Bot size={18} color="var(--text-primary)" />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Groq Autonomous Data Engineer
              <span className="badge badge-muted" style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>
                Qwen 3.8 27B LPU
              </span>
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
              Iterative Agent Loop: Diagnoses &rarr; Selects Functions &rarr; Cleans via Polars &rarr; Re-evaluates until Clean.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {/* Mode Switcher Tabs */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-main)',
            padding: '0.2rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}>
            <button
              onClick={() => setActiveMode('agent_clean')}
              className={`btn btn-xs ${activeMode === 'agent_clean' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
            >
              <Wand2 size={12} /> Autonomous Loop
            </button>
            <button
              onClick={() => setActiveMode('diagnostic')}
              className={`btn btn-xs ${activeMode === 'diagnostic' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
            >
              <Bot size={12} /> Quick Diagnosis
            </button>
          </div>
        </div>
      </div>

      {/* ── MODE 1: AUTONOMOUS AGENT CLEANING LOOP ───────────────────── */}
      {activeMode === 'agent_clean' && (
        <div>
          {/* Controls Bar: Task, Target Col, Max Iterations */}
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
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                Optimization Task
              </label>
              <select
                value={selectedTask}
                onChange={(e) => setSelectedTask(e.target.value)}
                disabled={cleaningActive}
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
                }}
              >
                <option value="GENERAL">General Tabular Cleaning</option>
                <option value="CLASSIFICATION">Classification (Protect Target & Drop Leaks)</option>
                <option value="REGRESSION">Regression (Continuous & Outliers)</option>
                <option value="LLM_FINETUNING">LLM Fine-tuning (Whitespace & Formatting)</option>
                <option value="CLUSTERING">Clustering (Dimensionality & Variance)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                Protected Target Column (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Survived, Churn"
                value={targetColumn}
                onChange={(e) => setTargetColumn(e.target.value)}
                disabled={cleaningActive}
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
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                Max Cleaning Iterations
              </label>
              <select
                value={maxIterations}
                onChange={(e) => setMaxIterations(Number(e.target.value))}
                disabled={cleaningActive}
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
                }}
              >
                <option value={2}>2 Iterations</option>
                <option value={3}>3 Iterations (Recommended)</option>
                <option value={4}>4 Iterations</option>
                <option value={5}>5 Iterations (Deep Cleanup)</option>
              </select>
            </div>

            <div>
              <button
                onClick={handleRunAutonomousCleaning}
                disabled={cleaningActive}
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
                {cleaningActive ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    Agent Iterating...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Run Autonomous Cleaning Loop
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Privacy Note */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '1rem' }}>
            <ShieldCheck size={13} color="var(--emerald-primary)" />
            <span>
              Autonomous Loop Rule: LLM only receives compact statistical fingerprints (~400 tokens); all transformations run deterministically on Polars.
            </span>
          </div>

          {/* Error Message */}
          {cleaningError && (
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
              <span>{cleaningError}</span>
            </div>
          )}

          {/* Active Cleaning Progress Animation */}
          {cleaningActive && (
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

          {/* Cleaning Completed Results View */}
          {agentResult && !cleaningActive && (
            <div>
              {/* Top Banner: Success + Comparison KPIs */}
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
                        Dataset Cleaned & Ready ({agentResult.report?.total_iterations} Iteration{agentResult.report?.total_iterations > 1 ? 's' : ''})
                      </h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Resolved {agentResult.report?.issues_resolved || 0} defect(s) across {agentResult.report?.steps?.length || 0} agentic reasoning cycle(s).
                      </p>
                    </div>
                  </div>

                  {/* Direct Download Button */}
                  <a
                    href={getDownloadUrl(projectId || dataset?.project_id, dataset?.id)}
                    className="btn btn-primary btn-sm"
                    download
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                  >
                    <Download size={13} />
                    Download Cleaned CSV
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
                  {/* Health Grade */}
                  <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Health Grade</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: getGradeColor(agentResult.report?.final_metrics?.health_grade) }}>
                      {agentResult.report?.final_metrics?.health_grade || 'A'}
                    </div>
                  </div>

                  {/* Readiness */}
                  <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Readiness</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {agentResult.report?.final_metrics?.readiness_score || 95}%
                    </div>
                  </div>

                  {/* Dimensions */}
                  <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dimensions</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {agentResult.report?.initial_metrics?.rows}x{agentResult.report?.initial_metrics?.columns}
                      <span style={{ color: 'var(--text-muted)', margin: '0 0.25rem' }}>&rarr;</span>
                      {agentResult.report?.final_metrics?.rows}x{agentResult.report?.final_metrics?.columns}
                    </div>
                  </div>

                  {/* Total Missing % */}
                  <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Missingness</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {agentResult.report?.initial_metrics?.total_null_pct}%
                      <span style={{ color: 'var(--text-muted)', margin: '0 0.25rem' }}>&rarr;</span>
                      <span style={{ color: 'var(--emerald-primary)' }}>{agentResult.report?.final_metrics?.total_null_pct}%</span>
                    </div>
                  </div>

                  {/* Issues Count */}
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

              {/* Step-by-Step Audit Trail */}
              <div style={{ marginBottom: '1rem' }}>
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
                        {/* Step Accordion Bar */}
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
                                Iteration {step.iteration}: {step.is_dataset_clean ? 'Verification & Clean State' : `Planned ${step.selected_actions?.length || 0} Action(s)`}
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

                        {/* Step Details Body */}
                        {isExpanded && (
                          <div style={{ padding: '0.9rem 1rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.8rem' }}>
                            {/* LLM Assessment */}
                            <div style={{ marginBottom: '0.75rem' }}>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                                LLM Agent Assessment
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

                            {/* Actions Selected & Executed */}
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
        </div>
      )}

      {/* ── MODE 2: QUICK AI DIAGNOSIS ONLY ─────────────────────────── */}
      {activeMode === 'diagnostic' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', margin: 0 }}>
              Read-only structured diagnosis of defect risks without applying modifications.
            </p>
            <button
              onClick={handleGenerateDiagnostic}
              disabled={loadingDiagnostic}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.8rem' }}
            >
              {loadingDiagnostic ? (
                <>
                  <Loader2 size={13} className="spin" />
                  Reasoning...
                </>
              ) : diagnosticData ? (
                <>
                  <RefreshCw size={13} />
                  Re-evaluate
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  Run AI Diagnosis
                </>
              )}
            </button>
          </div>

          {diagnosticError && (
            <div style={{
              background: 'var(--rose-bg)',
              border: '1px solid var(--rose-border)',
              color: 'var(--rose-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem 1rem',
              fontSize: '0.825rem',
              marginBottom: '1rem',
            }}>
              {diagnosticError}
            </div>
          )}

          {diagnosticData && !loadingDiagnostic && (
            <div>
              {/* Executive Summary */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem 1rem',
                marginBottom: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    color: getGradeColor(diagnosticData.insights?.health_grade),
                    fontFamily: 'var(--font-mono)',
                  }}>
                    Grade {diagnosticData.insights?.health_grade} ({diagnosticData.insights?.readiness_score}% Ready)
                  </div>
                </div>
                <p style={{ color: 'var(--text-primary)', fontSize: '0.825rem', lineHeight: 1.5, margin: 0 }}>
                  {diagnosticData.insights?.executive_summary}
                </p>
              </div>

              {/* Defect Breakdown */}
              {diagnosticData.insights?.defect_evaluations && diagnosticData.insights.defect_evaluations.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {diagnosticData.insights.defect_evaluations.map((d, i) => (
                    <div
                      key={i}
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.65rem 0.85rem',
                        fontSize: '0.78rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.defect_title}</span>
                        <span className="badge badge-muted">{d.severity}</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
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
          )}
        </div>
      )}
    </div>
  )
}
