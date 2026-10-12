import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  Bot,
  ShieldCheck,
  ShieldAlert,
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
  X,
  GitCompare,
  TrendingUp,
  TrendingDown,
  BarChart2,
  MessageSquare,
  Send,
  Copy,
  Code,
  Brain,
  Target,
  Award,
  Activity,
  FileText,
  Printer,
  ExternalLink,
} from 'lucide-react'
import {
  cleanDataset,
  runAgenticCleaning,
  analyzeDatasetWithLlm,
  getDownloadUrl,
  fetchDatasetVersions,
  rollbackDatasetVersion,
  getVersionDownloadUrl,
  fetchDatasetApprovals,
  submitApprovalDecision,
  fetchDatasetComparison,
  runSelfHealingClean,
  chatCleanDataset,
  downloadDatasetVersion,
  evaluateDatasetMl,
  fetchDatasetMlEvaluation,
  fetchDatasetAuditReport,
  downloadDatasetAuditReport,
  getDatasetAuditReportHtmlUrl,
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

  // Phase 12: Human Approval System State
  const [requireApproval, setRequireApproval] = useState(true)
  const [pendingApprovals, setPendingApprovals] = useState([])
  const [approvalsLoading, setApprovalsLoading] = useState(false)
  const [approvalActionInProgress, setApprovalActionInProgress] = useState(null)
  const [approvalFeedback, setApprovalFeedback] = useState({})
  const [approvalBannerMsg, setApprovalBannerMsg] = useState(null)

  // Phase 14: Autonomous Self-Healing Agent Loop Configuration & State
  const [maxIterations, setMaxIterations] = useState(3)
  const [selfHealingMode, setSelfHealingMode] = useState(true)
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

  // Phase 13: Re-Profiling & Before/After Comparison State
  const [comparisonReport, setComparisonReport] = useState(
    profile?.latest_comparison || dataset?.profile_json?.latest_comparison || null
  )
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonError, setComparisonError] = useState(null)
  const [compareVersionA, setCompareVersionA] = useState('')
  const [compareVersionB, setCompareVersionB] = useState('')

  // Phase 16: Chat-Driven Autonomous Pipeline & Dynamic Functions State
  const [chatInstructions, setChatInstructions] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState(null)
  const [chatHistory, setChatHistory] = useState([])
  const [copiedScriptId, setCopiedScriptId] = useState(null)

  // Phase 17: ML-Aware Evaluation State (80/20 Holdout)
  const [mlReport, setMlReport] = useState(
    profile?.ml_evaluation || dataset?.profile_json?.ml_evaluation || null
  )
  const [mlLoading, setMlLoading] = useState(false)
  const [mlError, setMlError] = useState(null)

  // Phase 18: Comprehensive Reporting & Audit Export State
  const [auditReport, setAuditReport] = useState(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState(null)
  const [auditDownloading, setAuditDownloading] = useState(null) // 'json' | 'html'

  const loadAuditReport = async () => {
    if (!dataset?.id) return
    setAuditLoading(true)
    setAuditError(null)
    try {
      const data = await fetchDatasetAuditReport(projectId || dataset.project_id, dataset.id, 'json')
      setAuditReport(data)
    } catch (err) {
      console.warn('Could not load audit report:', err)
      setAuditError(err.message || 'Could not load audit report.')
    } finally {
      setAuditLoading(false)
    }
  }

  const handleDownloadAuditReport = async (format = 'json') => {
    if (!dataset?.id) return
    setAuditDownloading(format)
    try {
      const blob = await downloadDatasetAuditReport(projectId || dataset.project_id, dataset.id, format)
      const baseName = (dataset?.original_filename || 'dataset').replace(/\.[^/.]+$/, '')
      const verNum = auditReport?.dataset_overview?.current_version ?? (currentVersion?.version_number ?? 0)
      const fileName = `${baseName}_v${verNum}_audit_report.${format}`
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Failed to download audit report:', err)
      alert(`Could not download audit report: ${err.message}`)
    } finally {
      setAuditDownloading(null)
    }
  }

  const handleOpenHtmlReport = () => {
    if (!dataset?.id) return
    const url = getDatasetAuditReportHtmlUrl(projectId || dataset.project_id, dataset.id)
    window.open(url, '_blank')
  }

  const loadComparison = async (vOld = null, vNew = null) => {
    if (!dataset?.id) return
    setComparisonLoading(true)
    setComparisonError(null)
    try {
      const data = await fetchDatasetComparison(
        projectId || dataset.project_id,
        dataset.id,
        vOld !== '' ? vOld : null,
        vNew !== '' ? vNew : null
      )
      setComparisonReport(data)
    } catch (err) {
      console.warn('Could not fetch dataset comparison:', err)
      setComparisonError(err.message || 'Could not load before/after comparison.')
    } finally {
      setComparisonLoading(false)
    }
  }

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

  // Load pending approvals
  const loadApprovals = async () => {
    if (!dataset?.id) return
    setApprovalsLoading(true)
    try {
      const data = await fetchDatasetApprovals(projectId || dataset.project_id, dataset.id, 'PENDING')
      setPendingApprovals(data.approvals || [])
    } catch (err) {
      console.warn('Could not fetch pending approvals:', err)
    } finally {
      setApprovalsLoading(false)
    }
  }

  useEffect(() => {
    if (profile?.current_version) {
      setCurrentVersion(profile.current_version)
    } else if (dataset?.current_version) {
      setCurrentVersion(dataset.current_version)
    }
    if (profile?.versions && profile.versions.length > 0) {
      setVersionsList(profile.versions)
    }
    if (profile?.ml_evaluation) {
      setMlReport(profile.ml_evaluation)
    } else if (dataset?.profile_json?.ml_evaluation) {
      setMlReport(dataset.profile_json.ml_evaluation)
    }
    loadVersions()
    loadApprovals()
  }, [dataset?.id, dataset?.current_version_id, profile?.version_number])

  // ── Handler 1: Autonomous Multi-Step AI Agent Cleaning Loop (Phase 14 Self-Healing) ───────
  const handleRunAgentLoop = async () => {
    if (!dataset?.id) return
    setAgentLoading(true)
    setAgentError(null)
    setApprovalBannerMsg(null)

    try {
      let res
      if (selfHealingMode) {
        res = await runSelfHealingClean(
          projectId || dataset.project_id,
          dataset.id,
          {
            taskType: selectedTask,
            targetColumn: targetColumn.trim() || null,
            maxIterations,
            requireApproval,
            maxLlmCalls: 10,
            maxActionsPerIteration: 10,
            compactPrompt: true,
          }
        )
      } else {
        res = await runAgenticCleaning(
          projectId || dataset.project_id,
          dataset.id,
          selectedTask,
          targetColumn.trim() || null,
          maxIterations,
          requireApproval
        )
      }
      setAgentResult(res)
      if (res?.report?.steps && res.report.steps.length > 0) {
        setExpandedStep(res.report.steps.length)
      }
      if (res?.version) {
        setCurrentVersion(res.version)
      }
      if (res?.comparison) {
        setComparisonReport(res.comparison)
      }
      if (res?.ml_evaluation) {
        setMlReport(res.ml_evaluation)
      }
      if (res?.pending_approvals && res.pending_approvals.length > 0) {
        setPendingApprovals(res.pending_approvals)
      } else {
        await loadApprovals()
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

  // ── Handlers for Human Approval (Phase 12) ────────────────────────
  const handleApproveAction = async (actionId) => {
    if (!dataset?.id || !actionId) return
    setApprovalActionInProgress(actionId)
    setApprovalBannerMsg(null)
    try {
      const feedbackText = approvalFeedback[actionId] || null
      const res = await submitApprovalDecision(
        projectId || dataset.project_id,
        dataset.id,
        actionId,
        'approve',
        feedbackText
      )
      setApprovalBannerMsg({
        type: 'success',
        text: res.message || 'Action approved & executed! New version snapshot created.',
      })
      const remainingApprovals = pendingApprovals.filter((item) => item.id !== actionId)
      setPendingApprovals(remainingApprovals)
      if (res.version) {
        setCurrentVersion(res.version)
        setVersionsList((prev) => {
          const exists = prev.some((v) => v.id === res.version.id || v.version_number === res.version.version_number)
          return exists
            ? prev.map((v) => (v.id === res.version.id || v.version_number === res.version.version_number ? res.version : v))
            : [...prev, res.version]
        })
      }
      if (res.comparison) {
        setComparisonReport(res.comparison)
      }
      if (res.ml_evaluation) {
        setMlReport(res.ml_evaluation)
      } else if (res.final_profile?.ml_evaluation) {
        setMlReport(res.final_profile.ml_evaluation)
      }
      try {
        if (feedbackText) {
          const parsed = JSON.parse(feedbackText)
          if (parsed.task_type) setSelectedTask(parsed.task_type)
          if (parsed.target_column) setTargetColumn(parsed.target_column)
        }
      } catch (e) {}

      // Update chatHistory items so in-stream approvals reflect the new version
      setChatHistory((prev) =>
        prev.map((entry) => {
          if (entry.status === 'WAITING_APPROVAL') {
            const rem = (entry.pending_approvals || []).filter((a) => a.id !== actionId)
            return {
              ...entry,
              status: rem.length === 0 ? 'CLEANED' : 'WAITING_APPROVAL',
              pending_approvals: rem,
              version: res.version || entry.version,
              comparison: res.comparison || entry.comparison,
            }
          }
          return entry
        })
      )

      // Transition agentResult state out of paused status
      setAgentResult((prev) => {
        if (!prev) return null
        const isStillWaiting = remainingApprovals.length > 0
        return {
          ...prev,
          status: isStillWaiting ? 'WAITING_APPROVAL' : 'CLEANED',
          message: isStillWaiting
            ? prev.message
            : (res.message || `Human approved action (${res.approval?.action_type || 'transformation'}) executed. New version snapshot created.`),
          pending_approvals: remainingApprovals,
          version: res.version || prev.version,
          report: prev.report ? {
            ...prev.report,
            steps: prev.report.steps?.map((step) => ({
              ...step,
              selected_actions: step.selected_actions?.map((act) => {
                if (act.approval_id === actionId || act.action_type === res.approval?.action_type) {
                  return {
                    ...act,
                    requires_approval: false,
                    approval_status: 'APPROVED',
                  }
                }
                return act
              }),
            })),
          } : prev.report,
        }
      })

      await loadVersions()
      await loadApprovals()
      if (onDatasetCleaned) {
        onDatasetCleaned(res)
      }
    } catch (err) {
      console.error('Failed to approve action:', err)
      setApprovalBannerMsg({
        type: 'error',
        text: err.message || 'Approval execution failed.',
      })
    } finally {
      setApprovalActionInProgress(null)
    }
  }

  const handleRejectAction = async (actionId) => {
    if (!dataset?.id || !actionId) return
    setApprovalActionInProgress(actionId)
    setApprovalBannerMsg(null)
    try {
      const feedbackText = approvalFeedback[actionId] || null
      const res = await submitApprovalDecision(
        projectId || dataset.project_id,
        dataset.id,
        actionId,
        'reject',
        feedbackText
      )
      const remainingApprovals = pendingApprovals.filter((item) => item.id !== actionId)
      setPendingApprovals(remainingApprovals)
      if (res.version) {
        setCurrentVersion(res.version)
      }
      if (res.comparison) {
        setComparisonReport(res.comparison)
      }

      setApprovalBannerMsg({
        type: res.version ? 'success' : 'neutral',
        text: res.message || 'Action rejected and skipped.',
      })

      // Transition agentResult state out of paused status
      setAgentResult((prev) => {
        if (!prev) return null
        const isStillWaiting = remainingApprovals.length > 0
        return {
          ...prev,
          status: isStillWaiting ? 'WAITING_APPROVAL' : 'CLEANED',
          message: isStillWaiting
            ? prev.message
            : (res.message || `Action (${res.approval?.action_type || 'transformation'}) rejected by user. Working dataset updated.`),
          pending_approvals: remainingApprovals,
          version: res.version || prev.version,
          report: prev.report ? {
            ...prev.report,
            steps: prev.report.steps?.map((step) => ({
              ...step,
              selected_actions: step.selected_actions?.map((act) => {
                if (act.approval_id === actionId || act.action_type === res.approval?.action_type) {
                  return {
                    ...act,
                    requires_approval: false,
                    approval_status: 'REJECTED',
                  }
                }
                return act
              }),
            })),
          } : prev.report,
        }
      })

      await loadVersions()
      await loadApprovals()
      if (onDatasetCleaned) {
        onDatasetCleaned(res)
      }
    } catch (err) {
      console.error('Failed to reject action:', err)
      setApprovalBannerMsg({
        type: 'error',
        text: err.message || 'Rejection failed.',
      })
    } finally {
      setApprovalActionInProgress(null)
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
      if (res.comparison) {
        setComparisonReport(res.comparison)
      }
      if (res.ml_evaluation) {
        setMlReport(res.ml_evaluation)
      }
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

  // ── Handler 5: Phase 16 Chat-Driven Cleaning with Dynamic Functions ──
  const handleRunChatClean = async (promptOverride = null) => {
    const textToRun = (promptOverride || chatInstructions).trim()
    if (!textToRun || !dataset?.id) return
    setChatLoading(true)
    setChatError(null)
    try {
      const res = await chatCleanDataset(
        projectId || dataset.project_id,
        dataset.id,
        {
          user_instructions: textToRun,
          task_objective: selectedTask,
          target_column: targetColumn.trim() || null,
          require_approval: requireApproval,
          max_iterations: maxIterations,
        }
      )

      const historyEntry = {
        id: Date.now(),
        user_prompt: textToRun,
        timestamp: new Date().toLocaleTimeString(),
        status: res.status,
        report: res.report,
        custom_scripts: res.custom_scripts || [],
        pending_approvals: res.pending_approvals || [],
        total_rollbacks: res.total_rollbacks || 0,
        version: res.version,
        comparison: res.comparison,
        termination_reason: res.termination_reason || 'Execution finished',
      }

      setChatHistory((prev) => [historyEntry, ...prev])
      setChatInstructions('')

      const newVer = res.version || res.final_profile?.current_version || null
      if (newVer) {
        setCurrentVersion(newVer)
        setVersionsList((prev) => {
          const exists = prev.some((v) => v.id === newVer.id || v.version_number === newVer.version_number)
          return exists
            ? prev.map((v) => (v.id === newVer.id || v.version_number === newVer.version_number ? newVer : v))
            : [...prev, newVer]
        })
      }

      if (res.status === 'WAITING_APPROVAL') {
        setPendingApprovals(res.pending_approvals || [])
      } else {
        if (res.comparison) {
          setComparisonReport(res.comparison)
        }
        if (res.ml_evaluation) {
          setMlReport(res.ml_evaluation)
        }
        if (onDatasetCleaned) {
          onDatasetCleaned(res)
        }
        await loadVersions()
      }
    } catch (err) {
      console.error('Chat cleaning error:', err)
      setChatError(err.message || 'Chat-guided cleaning failed.')
    } finally {
      setChatLoading(false)
    }
  }

  // ── Handler 6: Phase 17 ML-Aware Evaluation (80/20 Holdout Benchmark) ──
  const handleRunMlEvaluation = async (overrideTarget = null, overrideTask = null) => {
    if (!dataset?.id) return
    const tgt = (overrideTarget !== null && overrideTarget !== undefined ? overrideTarget : targetColumn)?.trim()
    const tsk = overrideTask || selectedTask
    setMlLoading(true)
    setMlError(null)
    try {
      const res = await evaluateDatasetMl(
        projectId || dataset?.project_id,
        dataset.id,
        {
          targetColumn: tgt || null,
          taskType: tsk,
          testSize: 0.20,
          randomState: 42,
        }
      )
      setMlReport(res)
    } catch (err) {
      console.error('ML Evaluation failed:', err)
      setMlError(err.message || 'ML evaluation failed.')
    } finally {
      setMlLoading(false)
    }
  }

  const handleCopyCode = (code, id) => {
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopiedScriptId(id)
    setTimeout(() => setCopiedScriptId(null), 2000)
  }

  const downloadUrl = getDownloadUrl(projectId || dataset?.project_id, dataset?.id)
  const isAnyCleaningActive = agentLoading || instantLoading || diagnosticLoading || chatLoading || mlLoading

  const [downloadingVersion, setDownloadingVersion] = useState(null)

  const handleDownloadVersion = async (versionNumber, format = 'csv') => {
    const key = `${versionNumber}_${format}`
    setDownloadingVersion(key)
    try {
      const pId = projectId || dataset?.project_id
      const dId = dataset?.id
      if (!dId) return

      const blob = await downloadDatasetVersion(pId, dId, versionNumber, format)
      const baseName = (dataset?.original_filename || 'dataset').replace(/\.[^/.]+$/, '')
      const ext = format === 'parquet' ? 'parquet' : 'csv'
      const fileName = `${baseName}_v${versionNumber ?? 0}.${ext}`

      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Download version failed:', err)
      alert(`Could not download version v${versionNumber}: ${err.message}`)
    } finally {
      setDownloadingVersion(null)
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

  const renderTaskSelector = (disabled = false) => (
    <select
      value={selectedTask}
      onChange={(e) => setSelectedTask(e.target.value)}
      disabled={disabled || isAnyCleaningActive}
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
      <optgroup label="General & Unsupervised">
        <option value="GENERAL">General Clean (Universal)</option>
        <option value="CLUSTERING">Clustering (Drop High Nulls & Constant)</option>
        <option value="LLM_FINETUNING">LLM Fine-tuning (Whitespace & Formatting)</option>
        <option value="TIME_SERIES">Time Series / Forecasting</option>
      </optgroup>
      <optgroup label="Regression Tasks (Numeric Targets)">
        <option value="REGRESSION">Regression (General)</option>
        <option value="LINEAR_REGRESSION">Linear Regression (Scale & Outliers)</option>
        <option value="CONTINUOUS_REGRESSION">Continuous Regression (Target Impute)</option>
        <option value="POLYNOMIAL_REGRESSION">Polynomial Regression (Feature Curves)</option>
      </optgroup>
      <optgroup label="Classification Tasks (Categorical / Discrete Targets)">
        <option value="CLASSIFICATION">Classification (General)</option>
        <option value="BINARY_CLASSIFICATION">Binary Classification (0/1 Balanced)</option>
        <option value="MULTICLASS_CLASSIFICATION">Multi-Class Classification</option>
        <option value="LOGISTIC_REGRESSION">Logistic Regression (Clean & Encode)</option>
      </optgroup>
    </select>
  )

  const renderTargetColumnSelector = (disabled = false, placeholder = 'e.g. Survived, Churn') => (
    columns.length > 0 ? (
      <select
        value={targetColumn}
        onChange={(e) => setTargetColumn(e.target.value)}
        disabled={disabled || isAnyCleaningActive}
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
        placeholder={placeholder}
        value={targetColumn}
        onChange={(e) => setTargetColumn(e.target.value)}
        disabled={disabled || isAnyCleaningActive}
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
    )
  )

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
              <span className="badge badge-muted" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem', borderColor: (currentVersion?.version_number ?? 0) > 0 ? 'var(--emerald-primary)' : undefined }}>
                <Layers size={11} color={(currentVersion?.version_number ?? 0) > 0 ? 'var(--emerald-primary)' : undefined} />
                v{currentVersion?.version_number ?? (profile?.version_number ?? (dataset?.version_number ?? 0))}
              </span>
              {pendingApprovals.length > 0 && (
                <span className="badge badge-amber" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <ShieldAlert size={11} /> {pendingApprovals.length} Approval Required
                </span>
              )}
              {(agentResult || instantReport || chatHistory.some((c) => c.status === 'CLEANED' || c.status === 'CONVERGED') || (currentVersion?.version_number ?? 0) > 0) && (
                <span className="badge badge-green" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Check size={11} /> Cleaned (v{currentVersion?.version_number ?? (profile?.version_number ?? 1)})
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
            {pendingApprovals.length > 0 && (
              <span style={{
                marginLeft: '0.35rem',
                background: '#f59e0b',
                color: '#000',
                borderRadius: '999px',
                padding: '0.05rem 0.35rem',
                fontSize: '0.65rem',
                fontWeight: 700,
              }}>
                {pendingApprovals.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveMode('chat_clean')}
            className={`btn btn-xs ${activeMode === 'chat_clean' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <MessageSquare size={12} color={activeMode === 'chat_clean' ? 'inherit' : 'var(--emerald-primary)'} />
            Chat & Custom Tasks
            <span style={{
              background: 'rgba(99, 102, 241, 0.2)',
              color: '#818cf8',
              borderRadius: '4px',
              padding: '0.05rem 0.3rem',
              fontSize: '0.62rem',
              fontWeight: 700,
            }}>
              P16
            </span>
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
            <History size={12} /> History & Rollback ({versionsList.length || (currentVersion?.version_number !== undefined ? currentVersion.version_number + 1 : 1)})
          </button>
          <button
            onClick={() => {
              setActiveMode('comparison')
              if (!comparisonReport) {
                loadComparison()
              }
            }}
            className={`btn btn-xs ${activeMode === 'comparison' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
          >
            <GitCompare size={12} /> Before/After Comparison
            {comparisonReport && (
              <span style={{
                marginLeft: '0.35rem',
                color: comparisonReport.quality_score_delta >= 0 ? 'var(--emerald-primary)' : '#f43f5e',
                fontWeight: 700,
                fontSize: '0.7rem',
              }}>
                {comparisonReport.quality_score_delta >= 0 ? `+${comparisonReport.quality_score_delta}` : comparisonReport.quality_score_delta}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveMode('ml_evaluation')
              if (!mlReport && !mlLoading) {
                handleRunMlEvaluation()
              }
            }}
            className={`btn btn-xs ${activeMode === 'ml_evaluation' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Brain size={12} color={activeMode === 'ml_evaluation' ? 'inherit' : 'var(--cyan-primary, #06b6d4)'} />
            ML Benchmark
            <span style={{
              background: 'rgba(6, 182, 212, 0.2)',
              color: '#22d3ee',
              borderRadius: '4px',
              padding: '0.05rem 0.3rem',
              fontSize: '0.62rem',
              fontWeight: 700,
            }}>
              P17
            </span>
            {mlReport && mlReport.status === 'SUCCESS' && (
              <span style={{
                marginLeft: '0.25rem',
                color: mlReport.primary_improved ? 'var(--emerald-primary)' : '#f43f5e',
                fontWeight: 700,
                fontSize: '0.7rem',
              }}>
                {mlReport.primary_improvement_pct >= 0 ? `+${mlReport.primary_improvement_pct.toFixed(1)}%` : `${mlReport.primary_improvement_pct.toFixed(1)}%`}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveMode('audit_report')
              if (!auditReport && !auditLoading) {
                loadAuditReport()
              }
            }}
            className={`btn btn-xs ${activeMode === 'audit_report' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <FileCheck size={12} color={activeMode === 'audit_report' ? 'inherit' : 'var(--emerald-primary)'} />
            Audit Report
            <span style={{
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              borderRadius: '4px',
              padding: '0.05rem 0.3rem',
              fontSize: '0.62rem',
              fontWeight: 700,
            }}>
              P18
            </span>
          </button>
        </div>
      </div>

      {/* Alert pill if actions are waiting for approval while user is viewing another tab */}
      {pendingApprovals.length > 0 && activeMode !== 'agent_loop' && activeMode !== 'chat_clean' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.55rem 0.85rem',
          marginBottom: '1rem',
          fontSize: '0.78rem',
          color: '#f59e0b',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <ShieldAlert size={15} color="#f59e0b" />
            <span>
              <strong>{pendingApprovals.length} Action{pendingApprovals.length > 1 ? 's' : ''} Awaiting Approval:</strong> An action in the Autonomous AI Loop requires human confirmation.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveMode('agent_loop')}
            className="btn btn-xs"
            style={{
              background: 'var(--amber-primary, #f59e0b)',
              color: '#000',
              fontWeight: 600,
              fontSize: '0.72rem',
              padding: '0.2rem 0.65rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            Review & Authorize &rarr;
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODE 1: Autonomous AI Cleaning Loop (Phase 14 Self-Healing)     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeMode === 'agent_loop' && (
        <div>
          {/* Header & Protocol Info */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '0.85rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={14} color="var(--emerald-primary)" />
              <span>
                {selfHealingMode
                  ? 'Phase 14 Self-Healing Loop: Multi-iteration autonomous cycle with in-loop regression detection, auto rollback, and LLM re-planning (max 5 iters, 10 LLM calls).'
                  : 'Agent Loop: Qwen 3.8 27B plans tool actions → Polars executes deterministically → Re-profiles.'}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
              Retention: 10-day auto-purge
            </div>
          </div>

          {/* Configuration Controls Bar */}
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
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 500 }}>
                Target Optimization Task
              </label>
              {renderTaskSelector()}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 500 }}>
                Protected Target Column
              </label>
              {renderTargetColumnSelector()}
            </div>

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

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 500 }}>
                Safety & Approval Guard
              </label>
              <button
                type="button"
                onClick={() => setRequireApproval(!requireApproval)}
                disabled={isAnyCleaningActive}
                className="btn btn-ghost"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: requireApproval ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-surface)',
                  border: requireApproval ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.78rem',
                  color: requireApproval ? '#f59e0b' : 'var(--text-muted)',
                  cursor: 'pointer',
                  height: '34px',
                }}
                title="When enabled, high-risk actions (column drops, outlier removal) pause the agent and await human approval"
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <ShieldAlert size={13} color={requireApproval ? '#f59e0b' : 'var(--text-muted)'} />
                  {requireApproval ? 'Gate High Risk' : 'Full Autopilot'}
                </span>
                <span
                  className={`badge ${requireApproval ? 'badge-amber' : 'badge-muted'}`}
                  style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}
                >
                  {requireApproval ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 500 }}>
                Self-Healing Loop (Phase 14)
              </label>
              <button
                type="button"
                onClick={() => setSelfHealingMode(!selfHealingMode)}
                disabled={isAnyCleaningActive}
                className="btn btn-ghost"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: selfHealingMode ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface)',
                  border: selfHealingMode ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.78rem',
                  color: selfHealingMode ? 'var(--emerald-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  height: '34px',
                }}
                title="Autonomous multi-iteration self-healing loop: auto-rollbacks candidate dataset on regression and re-plans with LLM"
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <RotateCcw size={13} color={selfHealingMode ? 'var(--emerald-primary)' : 'var(--text-muted)'} />
                  {selfHealingMode ? 'Auto Rollback & Re-plan' : 'Standard Loop'}
                </span>
                <span
                  className={`badge ${selfHealingMode ? 'badge-green' : 'badge-muted'}`}
                  style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}
                >
                  {selfHealingMode ? 'ACTIVE' : 'OFF'}
                </span>
              </button>
            </div>

            <div>
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
                    {selfHealingMode ? 'Self-Healing Loop...' : 'Agent Iterating...'}
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    {selfHealingMode ? 'Run Self-Healing Loop' : 'Run Autonomous Loop'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Agent Error Banner */}
          {agentError && (
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
              <span>{agentError}</span>
            </div>
          )}

          {/* Active Loading Animation */}
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

      {/* ── Approval Success/Error Banner ───────────────────────── */}
      {approvalBannerMsg && (
        <div style={{
          background: approvalBannerMsg.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : approvalBannerMsg.type === 'error' ? 'var(--rose-bg)' : 'rgba(245, 158, 11, 0.1)',
          border: `1px solid ${approvalBannerMsg.type === 'success' ? 'var(--emerald-primary)' : approvalBannerMsg.type === 'error' ? 'var(--rose-border)' : 'var(--amber-primary, #f59e0b)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '0.65rem 0.85rem',
          marginBottom: '1rem',
          fontSize: '0.78rem',
          color: approvalBannerMsg.type === 'success' ? 'var(--emerald-primary)' : approvalBannerMsg.type === 'error' ? 'var(--rose-primary)' : '#f59e0b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            {approvalBannerMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span>{approvalBannerMsg.text}</span>
          </div>
          <button
            onClick={() => setApprovalBannerMsg(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            &times;
          </button>
        </div>
      )}

      {/* ── PHASE 12: IN-CENTER HUMAN APPROVAL CARD(S) ────────── */}
      {pendingApprovals.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          marginBottom: '1.25rem',
        }}>
          {pendingApprovals.map((item) => {
            const isProcessing = approvalActionInProgress === item.id
            const formatActionTitle = (type = '') => {
              return type
                .split('_')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ')
            }

            if (item.action_type === 'clarify_task_objective') {
              const q = item.parameters?.clarification_question || item.reasoning
              const suggestedTask = item.parameters?.suggested_task_type || 'REGRESSION'
              const suggestedTarget = item.parameters?.suggested_target_column || ''
              const options = item.parameters?.suggested_options || []

              return (
                <div
                  key={item.id}
                  style={{
                    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(99, 102, 241, 0.08))',
                    border: '1px solid rgba(6, 182, 212, 0.45)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1.25rem',
                    position: 'relative',
                    boxShadow: '0 4px 18px -4px rgba(6, 182, 212, 0.15)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.65rem', marginBottom: '0.85rem', paddingBottom: '0.65rem', borderBottom: '1px solid rgba(6, 182, 212, 0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{
                        background: 'rgba(6, 182, 212, 0.15)',
                        padding: '0.45rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid rgba(6, 182, 212, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Brain size={18} color="var(--cyan-primary, #06b6d4)" />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                            AI Agent Clarification: Task & Target Objective
                          </h4>
                          <span className="badge badge-primary" style={{ fontSize: '0.68rem', fontWeight: 700, background: 'rgba(6, 182, 212, 0.2)', color: 'var(--cyan-primary, #06b6d4)' }}>
                            Clarification Needed
                          </span>
                        </div>
                        <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                          The LLM paused execution because the intended machine learning task or target variable is ambiguous.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Clarification Question Box */}
                  <div style={{
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.85rem 1rem',
                    marginBottom: '0.85rem',
                  }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--cyan-primary, #06b6d4)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Bot size={13} />
                      Agent Question:
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500, margin: '0 0 0.65rem 0' }}>
                      {q}
                    </p>

                    {/* Quick Selection Options Buttons */}
                    {options && options.length > 0 && (
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
                          Suggested Options:
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {options.map((opt, oIdx) => (
                            <button
                              key={oIdx}
                              type="button"
                              onClick={() => {
                                const optUpper = opt.toUpperCase()
                                let matchedTask = 'REGRESSION'
                                if (optUpper.includes('REGRESS') || optUpper.includes('PRICE') || optUpper.includes('CONTINUOUS')) {
                                  matchedTask = 'REGRESSION'
                                } else if (optUpper.includes('CLASSIF') || optUpper.includes('CHURN') || optUpper.includes('FRAUD')) {
                                  matchedTask = 'CLASSIFICATION'
                                } else if (optUpper.includes('GENERAL')) {
                                  matchedTask = 'GENERAL'
                                }
                                setSelectedTask(matchedTask)
                                if (suggestedTarget && !targetColumn) {
                                  setTargetColumn(suggestedTarget)
                                }
                                setApprovalFeedback(prev => ({
                                  ...prev,
                                  [item.id]: JSON.stringify({
                                    task_type: matchedTask,
                                    target_column: suggestedTarget || targetColumn,
                                    selected_option: opt,
                                  })
                                }))
                              }}
                              className="btn btn-xs btn-outline"
                              style={{
                                fontSize: '0.74rem',
                                padding: '0.25rem 0.55rem',
                                borderRadius: '999px',
                                background: 'var(--bg-surface)',
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Task & Target Selectors */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '0.75rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.75rem 0.9rem',
                    marginBottom: '0.85rem',
                    fontSize: '0.78rem',
                  }}>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
                        Target Task
                      </label>
                      <select
                        value={selectedTask}
                        onChange={(e) => {
                          setSelectedTask(e.target.value)
                          setApprovalFeedback(prev => ({
                            ...prev,
                            [item.id]: JSON.stringify({
                              task_type: e.target.value,
                              target_column: targetColumn,
                            })
                          }))
                        }}
                        style={{
                          width: '100%',
                          background: 'var(--bg-main)',
                          border: '1px solid var(--border-medium)',
                          color: 'var(--text-primary)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.35rem 0.6rem',
                          fontSize: '0.78rem',
                        }}
                      >
                        <optgroup label="Regression Tasks (Numeric Targets)">
                          <option value="REGRESSION">Regression (General)</option>
                          <option value="LINEAR_REGRESSION">Linear Regression</option>
                          <option value="CONTINUOUS_REGRESSION">Continuous Regression</option>
                        </optgroup>
                        <optgroup label="Classification Tasks (Discrete Targets)">
                          <option value="CLASSIFICATION">Classification (General)</option>
                          <option value="BINARY_CLASSIFICATION">Binary Classification</option>
                          <option value="LOGISTIC_REGRESSION">Logistic Regression</option>
                        </optgroup>
                        <optgroup label="Unsupervised / Other">
                          <option value="GENERAL">General Data Cleaning</option>
                        </optgroup>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
                        Target Column
                      </label>
                      {columns.length > 0 ? (
                        <select
                          value={targetColumn || suggestedTarget}
                          onChange={(e) => {
                            setTargetColumn(e.target.value)
                            setApprovalFeedback(prev => ({
                              ...prev,
                              [item.id]: JSON.stringify({
                                task_type: selectedTask,
                                target_column: e.target.value,
                              })
                            }))
                          }}
                          style={{
                            width: '100%',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border-medium)',
                            color: 'var(--text-primary)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.35rem 0.6rem',
                            fontSize: '0.78rem',
                          }}
                        >
                          <option value="">-- Select Target Column --</option>
                          {columns.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={targetColumn || suggestedTarget}
                          onChange={(e) => {
                            setTargetColumn(e.target.value)
                            setApprovalFeedback(prev => ({
                              ...prev,
                              [item.id]: JSON.stringify({
                                task_type: selectedTask,
                                target_column: e.target.value,
                              })
                            }))
                          }}
                          placeholder="e.g. price, churn"
                          style={{
                            width: '100%',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border-medium)',
                            color: 'var(--text-primary)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.35rem 0.6rem',
                            fontSize: '0.78rem',
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleRejectAction(item.id)}
                      disabled={isProcessing}
                      className="btn btn-ghost btn-sm"
                      style={{
                        fontSize: '0.78rem',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-secondary)',
                        padding: '0.35rem 0.8rem',
                      }}
                    >
                      {isProcessing ? <Loader2 size={12} className="spin" /> : <X size={13} />}
                      Skip / Continue General Cleaning
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const feedbackPayload = approvalFeedback[item.id] || JSON.stringify({
                          task_type: selectedTask || suggestedTask,
                          target_column: targetColumn || suggestedTarget,
                        })
                        approvalFeedback[item.id] = feedbackPayload
                        handleApproveAction(item.id)
                      }}
                      disabled={isProcessing}
                      className="btn btn-sm"
                      style={{
                        fontSize: '0.78rem',
                        background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
                        borderColor: '#06b6d4',
                        color: '#fff',
                        fontWeight: 600,
                        padding: '0.35rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      {isProcessing ? <Loader2 size={12} className="spin" /> : <Check size={14} />}
                      Confirm Task & Resume Pipeline
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={item.id}
                style={{
                  background: 'rgba(245, 158, 11, 0.05)',
                  border: '1px solid rgba(245, 158, 11, 0.55)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1.1rem 1.25rem',
                  position: 'relative',
                  boxShadow: '0 4px 18px -4px rgba(245, 158, 11, 0.12)',
                }}
              >
                {/* Header: Alert Icon + Action Title + Badges */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '0.65rem',
                  marginBottom: '0.85rem',
                  paddingBottom: '0.65rem',
                  borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      padding: '0.4rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <ShieldAlert size={18} color="#f59e0b" />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <h4 style={{ fontSize: '0.925rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                          {formatActionTitle(item.action_type)}
                        </h4>
                        <span className="badge badge-amber" style={{ fontSize: '0.68rem', fontWeight: 700 }}>
                          HIGH RISK
                        </span>
                        <span className="badge badge-muted" style={{ fontSize: '0.68rem' }}>
                          Requires Authorization
                        </span>
                      </div>
                      <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                        The autonomous agent paused cleaning before executing this destructive operation.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Confidence: <strong>{Math.round((item.confidence || 0.95) * 100)}%</strong>
                    </span>
                  </div>
                </div>

                {/* Impact Details & Target Columns */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.75rem',
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem 0.9rem',
                  marginBottom: '0.85rem',
                  fontSize: '0.78rem',
                }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                      Impacted Target Column(s)
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {item.target_columns && item.target_columns.length > 0 ? (
                        item.target_columns.map((col) => (
                          <span
                            key={col}
                            className="badge badge-amber"
                            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}
                          >
                            {col}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Entire dataset / multiple rows</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                      Estimated Impact
                    </div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {item.rows_affected_est > 0 ? `${item.rows_affected_est.toLocaleString()} rows` : 'Schema-level column removal'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                      Safety Policy
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      Creates reversible immutable snapshot upon execution
                    </div>
                  </div>
                </div>

                {/* LLM Strategic Reasoning Box */}
                <div style={{
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem 0.9rem',
                  marginBottom: '0.85rem',
                }}>
                  <div style={{ fontSize: '0.7rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Bot size={13} />
                    LLM Autonomous Reasoning & Defect Analysis
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                    {item.reasoning}
                  </p>
                </div>

                {/* Optional User Feedback / Instructions */}
                <div style={{ marginBottom: '0.85rem' }}>
                  <input
                    type="text"
                    placeholder="Optional feedback / reasoning note for audit trail (e.g., 'Approved for model baseline')..."
                    value={approvalFeedback[item.id] || ''}
                    onChange={(e) =>
                      setApprovalFeedback((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    disabled={isProcessing}
                    style={{
                      width: '100%',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-medium)',
                      color: 'var(--text-primary)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.4rem 0.65rem',
                      fontSize: '0.76rem',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Action Buttons: Approve vs Reject */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleRejectAction(item.id)}
                    disabled={isProcessing}
                    className="btn btn-ghost btn-sm"
                    style={{
                      fontSize: '0.78rem',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#ef4444',
                      padding: '0.35rem 0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    {isProcessing ? <Loader2 size={12} className="spin" /> : <X size={13} />}
                    Reject & Skip Action
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApproveAction(item.id)}
                    disabled={isProcessing}
                    className="btn btn-sm"
                    style={{
                      fontSize: '0.78rem',
                      background: 'var(--emerald-primary, #10b981)',
                      borderColor: 'var(--emerald-primary, #10b981)',
                      color: '#000',
                      fontWeight: 600,
                      padding: '0.35rem 0.95rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    {isProcessing ? <Loader2 size={12} className="spin" /> : <Check size={14} />}
                    Approve & Execute Transformation
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── VIEW 1: AGENT LOOP RESULTS (When completed or paused) ─── */}
      {agentResult && !agentLoading && (
        <div style={{ marginBottom: '1rem' }}>
          {/* Top Banner: Success or Paused for Approval */}
          {(() => {
            const isWaitingForApproval = agentResult.status === 'WAITING_APPROVAL' && pendingApprovals.length > 0
            return (
              <div style={{
                background: 'var(--bg-main)',
                border: isWaitingForApproval ? '1px solid rgba(245, 158, 11, 0.6)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '1rem 1.25rem',
                marginBottom: '1rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                  {isWaitingForApproval ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ShieldAlert size={18} color="#f59e0b" />
                      <div>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f59e0b' }}>
                          Autonomous Agent Paused: Human Approval Required
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {agentResult.message || `Iteration ${agentResult.current_iteration || 1} halted. Please review the high-risk action above.`}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircle2 size={18} color="var(--emerald-primary)" />
                      <div>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Autonomous AI Cleaning Complete ({agentResult.report?.total_iterations || 1} Iteration{agentResult.report?.total_iterations > 1 ? 's' : ''})
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {agentResult.message && !agentResult.message.includes('halted') && !agentResult.message.includes('paused')
                            ? agentResult.message
                            : `Resolved ${agentResult.report?.issues_resolved || 0} defect(s) across ${agentResult.report?.steps?.length || 1} agentic cycle(s).`}
                        </p>
                      </div>
                    </div>
                  )}

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

            {/* Phase 14: In-Loop Self-Healing Rollback Banner */}
            {agentResult.report?.total_rollbacks > 0 && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.65rem 0.85rem',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
                fontSize: '0.78rem',
                color: '#ef4444',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <RotateCcw size={14} />
                  <span>
                    <strong>Self-Healing Loop Active:</strong> {agentResult.report.total_rollbacks} regression event(s) detected and automatically reverted in-loop.
                    Agent adapted its strategy and converged successfully.
                  </span>
                </div>
                <span className="badge badge-rose" style={{ fontSize: '0.68rem', fontWeight: 600 }}>
                  {agentResult.report.total_rollbacks} In-Loop Rollback(s) Recovered
                </span>
              </div>
            )}

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

              {agentResult.report?.total_llm_calls !== undefined && (
                <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Telemetry</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {agentResult.report?.total_iterations || 1} iters &bull; {agentResult.report?.total_llm_calls || 1}/10 LLM
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

          {/* ML Readiness Summary in Agent Loop Results */}
          {mlReport && mlReport.status === 'SUCCESS' && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.05), rgba(37, 99, 235, 0.05))',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem 1rem',
              marginBottom: '1rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Brain size={15} color="var(--cyan-primary, #06b6d4)" />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    ML Task Readiness Benchmark ({mlReport.model_name})
                  </span>
                  <span className="badge badge-green" style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <ShieldCheck size={11} /> 0% Leakage (80/20 Holdout)
                  </span>
                  {mlReport.target_inferred && (
                    <span className="badge badge-muted" style={{ fontSize: '0.66rem' }}>
                      Auto-Inferred Target: {mlReport.target_column}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveMode('ml_evaluation')}
                  className="btn btn-xs btn-ghost"
                  style={{ fontSize: '0.72rem', color: 'var(--cyan-primary, #06b6d4)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <Activity size={12} /> View Full Evaluation Deep Dive &rarr;
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Headline: {mlReport.primary_metric_name}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: mlReport.primary_improved ? 'var(--emerald-primary)' : 'var(--text-primary)', marginTop: '0.15rem' }}>
                    {typeof mlReport.primary_cleaned_score === 'number' ? mlReport.primary_cleaned_score.toFixed(3) : mlReport.primary_cleaned_score}
                    <span style={{ fontSize: '0.75rem', marginLeft: '0.4rem', fontWeight: 500, color: mlReport.primary_improved ? 'var(--emerald-primary)' : '#f43f5e' }}>
                      ({mlReport.primary_improvement_pct >= 0 ? '+' : ''}{mlReport.primary_improvement_pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Raw baseline: {typeof mlReport.primary_raw_score === 'number' ? mlReport.primary_raw_score.toFixed(3) : mlReport.primary_raw_score}
                  </div>
                </div>

                {mlReport.metrics.filter(m => m.metric_name !== mlReport.primary_metric_name).slice(0, 2).map((m, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-surface)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {m.metric_name}
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: m.is_improved ? 'var(--emerald-primary)' : 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {typeof m.cleaned_score === 'number' ? m.cleaned_score.toFixed(3) : m.cleaned_score}
                      <span style={{ fontSize: '0.75rem', marginLeft: '0.4rem', fontWeight: 500, color: m.is_improved ? 'var(--emerald-primary)' : 'var(--text-muted)' }}>
                        ({m.percent_change >= 0 ? '+' : ''}{m.percent_change.toFixed(1)}%)
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      Raw baseline: {typeof m.raw_score === 'number' ? m.raw_score.toFixed(3) : m.raw_score}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-Step Agentic Audit Trail Accordion */}
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
              Multi-Step Agentic Audit Trail
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {agentResult.report?.steps?.map((step) => {
                const isExpanded = expandedStep === step.iteration
                const isStepRolledBack = Boolean(step.rolled_back || step.status === 'ROLLED_BACK')
                return (
                  <div
                    key={step.iteration}
                    style={{
                      background: 'var(--bg-main)',
                      border: isStepRolledBack ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-subtle)',
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
                        background: isExpanded ? 'var(--bg-subtle)' : isStepRolledBack ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: isStepRolledBack ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface)',
                          border: isStepRolledBack ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--border-medium)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          fontFamily: 'var(--font-mono)',
                          color: isStepRolledBack ? '#ef4444' : 'var(--text-primary)',
                        }}>
                          {step.iteration}
                        </div>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            Iteration {step.iteration}: {isStepRolledBack ? 'Rolled Back & Re-Planned' : step.is_dataset_clean ? 'Verification & Clean State' : `Executed ${step.selected_actions?.length || 0} Action(s)`}
                          </span>
                          <span style={{ marginLeft: '0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            ({step.pre_shape?.rows}x{step.pre_shape?.columns} &bull; Grade {step.health_grade})
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {isStepRolledBack ? (
                          <span className="badge badge-rose" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <RotateCcw size={10} /> Rolled Back
                          </span>
                        ) : step.is_dataset_clean || step.status === 'CONVERGED_CLEAN' ? (
                          <span className="badge badge-green" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Check size={10} /> Clean Verified
                          </span>
                        ) : step.status === 'WAITING_APPROVAL' ? (
                          <span className="badge badge-amber" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <ShieldAlert size={10} /> Paused
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
                        {/* Phase 14: In-Loop Rollback Alert Box */}
                        {isStepRolledBack && (
                          <div style={{
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.75rem 0.9rem',
                            marginBottom: '0.85rem',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#ef4444', fontWeight: 600, fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                              <RotateCcw size={13} />
                              <span>Autonomous In-Loop Rollback Triggered</span>
                            </div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', lineHeight: 1.4 }}>
                              Quality score dropped from{' '}
                              <strong>{step.regression_event?.quality_score_before?.toFixed(1) ?? step.pre_quality_score?.toFixed(1) ?? 'N/A'}</strong> to{' '}
                              <strong style={{ color: '#ef4444' }}>{step.regression_event?.quality_score_regressed?.toFixed(1) ?? step.post_quality_score?.toFixed(1) ?? 'N/A'}</strong>
                              {step.regression_event?.score_drop ? ` (-${step.regression_event.score_drop.toFixed(1)} pts)` : ''}.
                              Candidate dataset was rolled back in-loop.
                            </div>
                            {step.regression_event?.reasons && step.regression_event.reasons.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.35rem', marginBottom: '0.4rem' }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Detected Regressions:</div>
                                {step.regression_event.reasons.map((r, rIdx) => (
                                  <div key={rIdx} style={{ fontSize: '0.74rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <AlertTriangle size={11} color="#ef4444" />
                                    <span>{r}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '0.35rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                              Injected Prompt to Agent: &quot;Rolled back: quality dropped. Re-plan with alternative strategies.&quot;
                            </div>
                          </div>
                        )}
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
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                        <span className={`badge ${getActionBadgeClass(act.action_type)}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                                          {act.action_type}
                                        </span>
                                        {act.approval_status === 'APPROVED' ? (
                                          <span className="badge badge-green" style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <Check size={10} /> Approved & Executed
                                          </span>
                                        ) : act.approval_status === 'REJECTED' ? (
                                          <span className="badge badge-rose" style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <X size={10} /> Rejected & Skipped
                                          </span>
                                        ) : (act.requires_approval || act.approval_status === 'PENDING') && pendingApprovals.length > 0 ? (
                                          <span className="badge badge-amber" style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <ShieldAlert size={10} /> Paused for Approval (PENDING)
                                          </span>
                                        ) : null}
                                      </div>
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
                                    {act.approval_status === 'REJECTED' && (
                                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.25rem' }}>
                                        <X size={11} color="var(--rose-primary, #f43f5e)" />
                                        <span>Transformation skipped by user decision. Column data preserved.</span>
                                      </div>
                                    )}
                                    {act.approval_status === 'APPROVED' && !execRes && (
                                      <div style={{ fontSize: '0.74rem', color: 'var(--emerald-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.25rem' }}>
                                        <Check size={11} />
                                        <span>Transformation approved and executed. New version snapshot created.</span>
                                      </div>
                                    )}
                                    {((act.requires_approval || act.approval_status === 'PENDING') && act.approval_status !== 'REJECTED' && act.approval_status !== 'APPROVED' && !execRes && pendingApprovals.length > 0) && (
                                      <div style={{ fontSize: '0.74rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.25rem' }}>
                                        <ShieldAlert size={11} />
                                        <span>Execution paused pending human approval. See authorization card above.</span>
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

          {/* Ready to Run State (when not yet executed) */}
          {!agentResult && !agentLoading && (
            <div style={{
              background: 'var(--bg-main)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '2rem 1.5rem',
              textAlign: 'center',
              marginBottom: '1rem',
            }}>
              <Sparkles size={28} color="var(--emerald-primary)" style={{ margin: '0 auto 0.75rem' }} />
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Autonomous AI Loop Ready to Launch
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', maxWidth: '520px', margin: '0 auto 1.25rem', lineHeight: 1.5 }}>
                Qwen 3.8 27B agent will iteratively inspect anomalies, execute deterministic Polars transformations,
                auto-rollback on quality regression, and pause for human approval on high-risk actions.
              </p>
              <button
                type="button"
                onClick={handleRunAgentLoop}
                disabled={isAnyCleaningActive}
                className="btn btn-primary btn-sm"
                style={{ padding: '0.45rem 1.25rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Sparkles size={14} /> Launch Autonomous Cleaning Loop
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODE 2: Instant Standard Clean (Deterministic Heuristics)       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeMode === 'instant_deterministic' && (
        <div>
          {/* Header & Protocol Info */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '0.85rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={14} color="var(--emerald-primary)" />
              <span>Instant Mode: Pure deterministic Polars transformations (0 tokens consumed, runs in &lt;10ms).</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
              Deterministic Execution
            </div>
          </div>

          {/* Configuration Controls Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
            background: 'var(--bg-main)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
            alignItems: 'end',
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 500 }}>
                Target Optimization Task
              </label>
              {renderTaskSelector()}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 500 }}>
                Protected Target Column
              </label>
              {renderTargetColumnSelector()}
            </div>

            <div>
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
            </div>
          </div>

          {/* Instant Clean Error Banner */}
          {instantError && (
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
              <span>{instantError}</span>
            </div>
          )}

          {/* Instant Clean Loading Animation */}
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

          {/* ML Readiness Summary in Instant Clean Results */}
          {mlReport && mlReport.status === 'SUCCESS' && (
            <div style={{
              marginTop: '1rem',
              paddingTop: '0.85rem',
              borderTop: '1px solid var(--border-subtle)',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.05), rgba(37, 99, 235, 0.05))',
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem 1rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Brain size={15} color="var(--cyan-primary, #06b6d4)" />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    ML Task Readiness Benchmark ({mlReport.model_name})
                  </span>
                  <span className="badge badge-green" style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <ShieldCheck size={11} /> 0% Leakage (80/20 Holdout)
                  </span>
                  {mlReport.target_inferred && (
                    <span className="badge badge-muted" style={{ fontSize: '0.66rem' }}>
                      Auto-Inferred Target: {mlReport.target_column}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveMode('ml_evaluation')}
                  className="btn btn-xs btn-ghost"
                  style={{ fontSize: '0.72rem', color: 'var(--cyan-primary, #06b6d4)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <Activity size={12} /> View Full Evaluation Deep Dive &rarr;
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Headline: {mlReport.primary_metric_name}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: mlReport.primary_improved ? 'var(--emerald-primary)' : 'var(--text-primary)', marginTop: '0.15rem' }}>
                    {typeof mlReport.primary_cleaned_score === 'number' ? mlReport.primary_cleaned_score.toFixed(3) : mlReport.primary_cleaned_score}
                    <span style={{ fontSize: '0.75rem', marginLeft: '0.4rem', fontWeight: 500, color: mlReport.primary_improved ? 'var(--emerald-primary)' : '#f43f5e' }}>
                      ({mlReport.primary_improvement_pct >= 0 ? '+' : ''}{mlReport.primary_improvement_pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    Raw baseline: {typeof mlReport.primary_raw_score === 'number' ? mlReport.primary_raw_score.toFixed(3) : mlReport.primary_raw_score}
                  </div>
                </div>

                {mlReport.metrics.filter(m => m.metric_name !== mlReport.primary_metric_name).slice(0, 2).map((m, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-surface)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {m.metric_name}
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: m.is_improved ? 'var(--emerald-primary)' : 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {typeof m.cleaned_score === 'number' ? m.cleaned_score.toFixed(3) : m.cleaned_score}
                      <span style={{ fontSize: '0.75rem', marginLeft: '0.4rem', fontWeight: 500, color: m.is_improved ? 'var(--emerald-primary)' : 'var(--text-muted)' }}>
                        ({m.percent_change >= 0 ? '+' : ''}{m.percent_change.toFixed(1)}%)
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      Raw baseline: {typeof m.raw_score === 'number' ? m.raw_score.toFixed(3) : m.raw_score}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

          {/* Ready State */}
          {!instantReport && !instantLoading && (
            <div style={{
              background: 'var(--bg-main)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '2rem 1.5rem',
              textAlign: 'center',
              marginBottom: '1rem',
            }}>
              <Zap size={28} color="var(--emerald-primary)" style={{ margin: '0 auto 0.75rem' }} />
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Instant Standard Clean Ready
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', maxWidth: '520px', margin: '0 auto 1.25rem', lineHeight: 1.5 }}>
                Apply deterministic Polars heuristics: remove duplicate rows, drop surrogate identifier keys, constant columns, and catastrophic null columns in under 10 milliseconds.
              </p>
              <button
                type="button"
                onClick={handleRunInstantClean}
                disabled={isAnyCleaningActive}
                className="btn btn-primary btn-sm"
                style={{ padding: '0.45rem 1.25rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Zap size={14} /> Run Instant Clean (0s)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODE 3: Read-Only Diagnostic                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeMode === 'diagnostic_only' && (
        <div>
          {/* Header & Protocol Info */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '0.85rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={14} color="var(--emerald-primary)" />
              <span>Diagnostic Mode: Compact fingerprint analyzed for defect impact (read-only, no modifications).</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
              Zero Modifications
            </div>
          </div>

          {/* Configuration Controls Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
            background: 'var(--bg-main)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
            alignItems: 'end',
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 500 }}>
                Target Optimization Task
              </label>
              {renderTaskSelector()}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 500 }}>
                Protected Target Column
              </label>
              {renderTargetColumnSelector()}
            </div>

            <div>
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
            </div>
          </div>

          {/* Diagnostic Error Banner */}
          {diagnosticError && (
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
              <span>{diagnosticError}</span>
            </div>
          )}

          {/* Diagnostic Loading Animation */}
          {diagnosticLoading && (
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
                Analyzing Dataset Fingerprint with LLM...
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

              {diagnosticData.insights?.cleaning_strategy && (
                <div style={{
                  marginTop: '0.85rem',
                  padding: '0.75rem 0.95rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.78rem',
                }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--emerald-primary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Sparkles size={12} />
                    Recommended Cleaning Strategy
                  </div>
                  <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                    {diagnosticData.insights.cleaning_strategy}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ready State */}
          {!diagnosticData && !diagnosticLoading && (
            <div style={{
              background: 'var(--bg-main)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '2rem 1.5rem',
              textAlign: 'center',
              marginBottom: '1rem',
            }}>
              <Bot size={28} color="var(--cyan-primary, #06b6d4)" style={{ margin: '0 auto 0.75rem' }} />
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Defect Diagnostic Ready
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', maxWidth: '520px', margin: '0 auto 1.25rem', lineHeight: 1.5 }}>
                Analyze the Polars profiling fingerprint with LLM reasoning to evaluate defect severity, downstream ML risk, and prioritized cleaning recommendations without modifying the dataset.
              </p>
              <button
                type="button"
                onClick={handleRunDiagnostic}
                disabled={isAnyCleaningActive}
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.45rem 1.25rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Bot size={14} /> Generate Diagnosis
              </button>
            </div>
          )}
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
                          onClick={(e) => {
                            e.preventDefault()
                            handleDownloadVersion(v.version_number, 'csv')
                          }}
                          className="btn btn-xs btn-outline"
                          style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          <Download size={11} /> {downloadingVersion === `${v.version_number}_csv` ? 'Downloading...' : 'CSV'}
                        </a>
                        <a
                          href={getVersionDownloadUrl(projectId || dataset.project_id, dataset.id, v.version_number, 'parquet')}
                          download
                          onClick={(e) => {
                            e.preventDefault()
                            handleDownloadVersion(v.version_number, 'parquet')
                          }}
                          className="btn btn-xs btn-outline"
                          style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          <Download size={11} /> {downloadingVersion === `${v.version_number}_parquet` ? 'Downloading...' : 'Parquet'}
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

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODE 5: Before / After Re-Profiling & Comparison (Phase 13)    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeMode === 'comparison' && (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-sm)',
          padding: '1.25rem',
          marginBottom: '1rem',
        }}>
          {/* Header & Version Selectors */}
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
                  Before / After Re-Profiling & Regression Comparison
                </span>
                <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>
                  Phase 13
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', margin: 0 }}>
                Deterministic quality score delta, target class distribution shift detection, and per-metric verification.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>From:</label>
                <select
                  value={compareVersionA}
                  onChange={(e) => setCompareVersionA(e.target.value)}
                  className="select-input"
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    background: 'var(--bg-main)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <option value="">Default (Parent/v0)</option>
                  {versionsList.map((v) => (
                    <option key={v.id} value={v.version_number}>v{v.version_number} ({v.created_by_action?.slice(0, 20)}...)</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>To:</label>
                <select
                  value={compareVersionB}
                  onChange={(e) => setCompareVersionB(e.target.value)}
                  className="select-input"
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    background: 'var(--bg-main)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <option value="">Default (Current/vN)</option>
                  {versionsList.map((v) => (
                    <option key={v.id} value={v.version_number}>v{v.version_number} ({v.created_by_action?.slice(0, 20)}...)</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => loadComparison(compareVersionA || null, compareVersionB || null)}
                disabled={comparisonLoading}
                className="btn btn-xs btn-primary"
                style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              >
                {comparisonLoading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
                Re-Evaluate
              </button>
            </div>
          </div>

          {/* Loading / Error States */}
          {comparisonLoading && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
              <Loader2 size={24} className="spin" style={{ margin: '0 auto 0.5rem' }} />
              <p style={{ fontSize: '0.8rem' }}>Re-profiling dataset states and computing delta comparison...</p>
            </div>
          )}

          {comparisonError && !comparisonLoading && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              borderRadius: 'var(--radius-sm)',
              padding: '0.65rem 0.85rem',
              color: '#ef4444',
              fontSize: '0.78rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <AlertTriangle size={14} />
              {comparisonError}
            </div>
          )}

          {/* Comparison Report Content */}
          {comparisonReport && !comparisonLoading && (
            <div>
              {/* Regression / Auto-Rollback Status Banner */}
              {comparisonReport.regression_detected ? (
                <div style={{
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid #f43f5e',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <AlertTriangle size={16} color="#f43f5e" />
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f43f5e' }}>
                      Quality Regression Detected
                    </span>
                    {comparisonReport.auto_rolled_back && (
                      <span className="badge badge-amber" style={{ fontSize: '0.68rem' }}>
                        Auto-Rollback Triggered
                      </span>
                    )}
                  </div>
                  <ul style={{ margin: '0 0 0.4rem 1.25rem', padding: 0, fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                    {comparisonReport.regression_reasons?.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                  {comparisonReport.auto_rolled_back && (
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      🛡️ System safety layer automatically restored the dataset to the parent clean snapshot.
                    </p>
                  )}
                </div>
              ) : (
                <div style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid var(--emerald-primary)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.65rem 0.85rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <CheckCircle2 size={16} color="var(--emerald-primary)" />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                    {comparisonReport.summary || 'Quality improved without regressions. Transformation safety verified.'}
                  </span>
                </div>
              )}

              {/* Quality Score Highlight Card */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}>
                <div style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem',
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                    Quality Score Delta
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {comparisonReport.quality_score_after?.overall_score ?? 0}
                    </span>
                    <span style={{
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      color: comparisonReport.quality_score_delta >= 0 ? 'var(--emerald-primary)' : '#f43f5e',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                    }}>
                      {comparisonReport.quality_score_delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {comparisonReport.quality_score_delta >= 0 ? `+${comparisonReport.quality_score_delta}` : comparisonReport.quality_score_delta} pts
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Previous: {comparisonReport.quality_score_before?.overall_score ?? 0} / 100
                  </div>
                </div>

                <div style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem',
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                    Formula Breakdown (Post-Clean)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', fontSize: '0.74rem' }}>
                    <div>Completeness: <strong>{comparisonReport.quality_score_after?.completeness_score}%</strong></div>
                    <div>Type Safety: <strong>{comparisonReport.quality_score_after?.type_consistency_score}%</strong></div>
                    <div>Uniqueness: <strong>{comparisonReport.quality_score_after?.uniqueness_score}%</strong></div>
                    <div>Validity: <strong>{comparisonReport.quality_score_after?.validity_score}%</strong></div>
                  </div>
                </div>

                {comparisonReport.target_distribution && (
                  <div style={{
                    background: 'var(--bg-main)',
                    border: `1px solid ${comparisonReport.target_distribution.shift_detected ? '#f43f5e' : 'var(--border-medium)'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.85rem',
                  }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                      Target Distribution ({comparisonReport.target_distribution.target_column || 'Target'})
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: comparisonReport.target_distribution.shift_detected ? '#f43f5e' : 'var(--emerald-primary)' }}>
                      {comparisonReport.target_distribution.shift_detected ? 'Shift Exceeded >20%' : 'Stable (<=20% change)'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Max Shift: {comparisonReport.target_distribution.max_relative_shift_pct}%
                    </div>
                  </div>
                )}
              </div>

              {/* Per-Metric Comparison Table */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                marginBottom: '1rem',
              }}>
                <div style={{ padding: '0.6rem 0.85rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.78rem', fontWeight: 600 }}>
                  Per-Metric Comparison Table
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Metric</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Category</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Before</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>After</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Delta</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonReport.metrics_table?.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '0.45rem 0.75rem', fontWeight: 500 }}>{row.metric_name}</td>
                          <td style={{ padding: '0.45rem 0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{row.category}</td>
                          <td style={{ padding: '0.45rem 0.75rem' }}>{String(row.before)}</td>
                          <td style={{ padding: '0.45rem 0.75rem', fontWeight: 600 }}>{String(row.after)}</td>
                          <td style={{
                            padding: '0.45rem 0.75rem',
                            fontWeight: 600,
                            color: row.status === 'improved' ? 'var(--emerald-primary)' : row.status === 'degraded' ? '#f43f5e' : 'var(--text-secondary)',
                          }}>
                            {String(row.delta)}
                          </td>
                          <td style={{ padding: '0.45rem 0.75rem' }}>
                            <span className={`badge ${row.status === 'improved' ? 'badge-green' : row.status === 'degraded' ? 'badge-amber' : 'badge-muted'}`} style={{ fontSize: '0.65rem' }}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Resolved vs Introduced Issues */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                <div style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem',
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--emerald-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <CheckCircle2 size={13} />
                    Resolved Issues ({comparisonReport.issues_resolved?.length || 0})
                  </div>
                  {comparisonReport.issues_resolved?.length === 0 ? (
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>No issues were resolved in this step.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {comparisonReport.issues_resolved?.map((iss, i) => (
                        <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-primary)' }}>
                          • <strong>{iss.column_name || 'dataset'}</strong>: {iss.issue_type} — {iss.description}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem',
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: comparisonReport.new_issues_introduced?.length > 0 ? '#f43f5e' : 'var(--text-muted)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <AlertTriangle size={13} />
                    Newly Introduced Issues ({comparisonReport.new_issues_introduced?.length || 0})
                  </div>
                  {comparisonReport.new_issues_introduced?.length === 0 ? (
                    <p style={{ fontSize: '0.72rem', color: 'var(--emerald-primary)', margin: 0 }}>Clean transformation — zero new defects introduced ✅</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {comparisonReport.new_issues_introduced?.map((iss, i) => (
                        <div key={i} style={{ fontSize: '0.72rem', color: '#f43f5e' }}>
                          • <strong>{iss.column_name || 'dataset'}</strong>: {iss.issue_type} — {iss.description}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODE 6: Chat Assistant & Custom Tasks (Phase 16)               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeMode === 'chat_clean' && (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-sm)',
          padding: '1.25rem',
          marginBottom: '1rem',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1.2rem',
            paddingBottom: '0.85rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MessageSquare size={16} color="var(--emerald-primary)" />
                  Intent-Guided Autonomous Chat Cleaning
                </span>
                <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>
                  Phase 16
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: 0 }}>
                Tell the AI what tasks or custom requirements to perform. The agent remediates defects, writes safe dynamic Polars functions when needed, prompts for approval, and self-heals with automated rollback.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-muted" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <ShieldCheck size={12} color="var(--emerald-primary)" /> AST Sandbox Guard Active
              </span>
            </div>
          </div>

          {/* Active Working Dataset Version Status Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
            background: 'var(--bg-main)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.55rem 0.85rem',
            marginBottom: '1rem',
            fontSize: '0.78rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span
                className="badge badge-green"
                style={{
                  fontSize: '0.72rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.2rem 0.5rem',
                  fontWeight: 600,
                }}
              >
                <Layers size={11} /> Active Dataset: v{currentVersion?.version_number ?? (profile?.version_number ?? 0)}
              </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.76rem' }}>
                {currentVersion?.created_by_action || (currentVersion?.version_number === 0 ? 'Initial Dataset Ingest (v0 Original)' : 'Current Ingested State')}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setActiveMode('version_history')}
                className="btn btn-xs btn-ghost"
                style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <History size={11} /> View Version Lineage ({versionsList.length || 1})
              </button>
              <a
                href={getVersionDownloadUrl(projectId || dataset?.project_id, dataset?.id, currentVersion?.version_number ?? (profile?.version_number ?? 0), 'csv')}
                download
                onClick={(e) => {
                  e.preventDefault()
                  handleDownloadVersion(currentVersion?.version_number ?? (profile?.version_number ?? 0), 'csv')
                }}
                className="btn btn-xs btn-outline"
                style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <Download size={11} /> {downloadingVersion === `${currentVersion?.version_number ?? (profile?.version_number ?? 0)}_csv` ? 'Downloading...' : `Download v${currentVersion?.version_number ?? (profile?.version_number ?? 0)} CSV`}
              </a>
            </div>
          </div>

          {/* Interactive Chat Input Area */}
          <div style={{
            background: 'var(--bg-main)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-sm)',
            padding: '1rem',
            marginBottom: '1.25rem',
          }}>
            <label style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '0.5rem',
            }}>
              Your Task Objectives & Requirements:
            </label>

            <textarea
              value={chatInstructions}
              onChange={(e) => setChatInstructions(e.target.value)}
              placeholder="e.g. Prepare this dataset for churn prediction: drop customer IDs, cap tenure outliers, fill missing charges with median, and engineer a charge_per_tenure ratio column..."
              rows={3}
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.65rem 0.85rem',
                fontSize: '0.82rem',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                marginBottom: '0.75rem',
              }}
            />

            {/* Quick Prompt Presets */}
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Quick Task Templates (Click to fill):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {[
                  {
                    label: '🚀 Churn ML Prep',
                    text: 'Prepare for ML classification: drop surrogate IDs, impute missing values with median/mode, and cap numerical outliers.',
                  },
                  {
                    label: '🧮 Feature Engineering Ratio',
                    text: 'Engineer a new derived feature column calculating the ratio of numerical columns and clip negative values.',
                  },
                  {
                    label: '📅 Standardize Dates & Text',
                    text: 'Standardize all inconsistent date formats to ISO-8601 YYYY-MM-DD, trim text whitespace, and drop constant columns.',
                  },
                  {
                    label: '🏷️ Non-Negative Bounds',
                    text: 'Enforce domain range bounds: clip price and quantity columns to be non-negative (>= 0) and remove extreme anomalies.',
                  },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setChatInstructions(preset.text)}
                    className="btn btn-xs btn-ghost"
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.2rem 0.5rem',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Controls Row */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.76rem',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={requireApproval}
                    onChange={(e) => setRequireApproval(e.target.checked)}
                    style={{ accentColor: 'var(--emerald-primary)' }}
                  />
                  <span>Require Approval for Custom Scripts & High Risk</span>
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  <span>Max Iterations:</span>
                  <select
                    value={maxIterations}
                    onChange={(e) => setMaxIterations(Number(e.target.value))}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.15rem 0.4rem',
                      fontSize: '0.75rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} {n === 1 ? 'iteration' : 'iterations'}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={() => handleRunChatClean()}
                disabled={chatLoading || !chatInstructions.trim()}
                className="btn btn-sm btn-primary"
                style={{
                  fontSize: '0.78rem',
                  padding: '0.35rem 0.95rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                {chatLoading ? (
                  <>
                    <Loader2 size={13} className="spin" />
                    <span>Executing Pipeline...</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Run Chat-Guided Cleaning</span>
                  </>
                )}
              </button>
            </div>

            {chatError && (
              <div style={{
                marginTop: '0.75rem',
                padding: '0.6rem 0.85rem',
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                borderRadius: 'var(--radius-sm)',
                color: '#f43f5e',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}>
                <AlertTriangle size={14} />
                <span>{chatError}</span>
              </div>
            )}
          </div>

          {/* Conversation Stream & Telemetry */}
          {chatHistory.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Session Run History ({chatHistory.length})
              </div>

              {chatHistory.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1rem',
                  }}
                >
                  {/* User Request Bubble */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    marginBottom: '0.85rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{
                      background: 'rgba(99, 102, 241, 0.15)',
                      padding: '0.35rem',
                      borderRadius: '50%',
                      color: '#818cf8',
                    }}>
                      <Bot size={15} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          User Task Prompt
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {item.timestamp}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', margin: 0, fontStyle: 'italic' }}>
                        "{item.user_prompt}"
                      </p>
                    </div>
                  </div>

                  {/* Status Banner */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    background: item.status === 'WAITING_APPROVAL'
                      ? 'rgba(245, 158, 11, 0.1)'
                      : item.status === 'CONVERGED' || item.status === 'CLEANED'
                      ? 'rgba(16, 185, 129, 0.1)'
                      : 'rgba(56, 189, 248, 0.1)',
                    border: `1px solid ${
                      item.status === 'WAITING_APPROVAL'
                        ? 'rgba(245, 158, 11, 0.3)'
                        : item.status === 'CONVERGED' || item.status === 'CLEANED'
                        ? 'rgba(16, 185, 129, 0.3)'
                        : 'rgba(56, 189, 248, 0.3)'
                    }`,
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', fontWeight: 600 }}>
                      {item.status === 'WAITING_APPROVAL' ? (
                        <>
                          <ShieldAlert size={14} color="#f59e0b" />
                          <span style={{ color: '#f59e0b' }}>Status: Awaiting Human Approval</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={14} color="var(--emerald-primary)" />
                          <span style={{ color: 'var(--emerald-primary)' }}>Status: {item.status}</span>
                        </>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.72rem' }}>
                      {item.report?.overall_quality_improvement !== undefined && (
                        <span style={{
                          fontWeight: 700,
                          color: item.report.overall_quality_improvement >= 0 ? 'var(--emerald-primary)' : '#f43f5e',
                        }}>
                          Quality Delta: {item.report.overall_quality_improvement >= 0 ? `+${item.report.overall_quality_improvement}` : item.report.overall_quality_improvement} pts
                        </span>
                      )}
                      {item.total_rollbacks > 0 && (
                        <span className="badge badge-amber" style={{ fontSize: '0.68rem' }}>
                          <RotateCcw size={10} /> {item.total_rollbacks} Auto-Rollbacks
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Termination & Rationale */}
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    <strong>Agent Outcome:</strong> {item.termination_reason}
                  </div>

                  {/* Custom Polars Scripts Section */}
                  {item.custom_scripts && item.custom_scripts.length > 0 && (
                    <div style={{ marginBottom: '0.85rem' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Code size={13} color="var(--emerald-primary)" />
                        Custom Dynamic Polars Transformation Functions ({item.custom_scripts.length})
                      </div>

                      {item.custom_scripts.map((script, sIdx) => (
                        <div
                          key={sIdx}
                          style={{
                            background: '#0f172a',
                            border: '1px solid #1e293b',
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.75rem',
                            marginBottom: '0.5rem',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ color: '#38bdf8', fontWeight: 600, fontSize: '0.76rem', fontFamily: 'monospace' }}>
                                def {script.function_name || 'transform'}(df: pl.DataFrame) -&gt; pl.DataFrame:
                              </span>
                              {script.is_safe && (
                                <span style={{
                                  background: 'rgba(16, 185, 129, 0.2)',
                                  color: 'var(--emerald-primary)',
                                  fontSize: '0.65rem',
                                  padding: '0.1rem 0.35rem',
                                  borderRadius: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.2rem',
                                }}>
                                  <ShieldCheck size={10} /> AST Sandbox Verified
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleCopyCode(script.code, `${item.id}-${sIdx}`)}
                              className="btn btn-xs btn-ghost"
                              style={{
                                color: '#94a3b8',
                                fontSize: '0.68rem',
                                padding: '0.15rem 0.4rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}
                            >
                              <Copy size={11} />
                              {copiedScriptId === `${item.id}-${sIdx}` ? 'Copied!' : 'Copy Code'}
                            </button>
                          </div>

                          {script.description && (
                            <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0 0 0.4rem 0' }}>
                              {script.description}
                            </p>
                          )}

                          <pre style={{
                            margin: 0,
                            fontSize: '0.75rem',
                            color: '#e2e8f0',
                            fontFamily: 'monospace',
                            overflowX: 'auto',
                            background: 'rgba(0, 0, 0, 0.3)',
                            padding: '0.5rem',
                            borderRadius: '4px',
                          }}>
                            <code>{script.code || '# No code generated'}</code>
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pending Approvals In-Stream Card */}
                  {item.status === 'WAITING_APPROVAL' && pendingApprovals.length > 0 && (
                    <div style={{
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.85rem',
                      marginBottom: '0.75rem',
                    }}>
                      <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#f59e0b', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <ShieldAlert size={14} /> Action Requires Human Sign-Off
                      </div>
                      <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: '0 0 0.6rem 0' }}>
                        The agent generated high-risk transformations or custom code. Click Approve to execute safely inside the Polars sandbox with rollback guards.
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {pendingApprovals.map((appr) => (
                          <div key={appr.id} style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              onClick={() => handleApproveAction(appr.id)}
                              disabled={Boolean(approvalActionInProgress)}
                              className="btn btn-xs btn-primary"
                              style={{ fontSize: '0.72rem' }}
                            >
                              Approve & Execute ({appr.action_type})
                            </button>
                            <button
                              onClick={() => handleRejectAction(appr.id)}
                              disabled={Boolean(approvalActionInProgress)}
                              className="btn btn-xs btn-ghost"
                              style={{ fontSize: '0.72rem', color: '#f43f5e' }}
                            >
                              Reject & Skip
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prominent Version Snapshot Card & Navigation */}
                  {item.version && (
                    <div style={{
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.75rem 0.85rem',
                      marginTop: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <span
                            className="badge badge-green"
                            style={{
                              fontSize: '0.72rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.15rem 0.45rem',
                              fontWeight: 700,
                            }}
                          >
                            <Layers size={11} /> Version v{item.version.version_number} Snapshot Created
                          </span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                            {item.version.created_by_action || 'Chat Dynamic Pipeline Transformation'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <button
                            type="button"
                            onClick={() => setActiveMode('version_history')}
                            className="btn btn-xs btn-primary"
                            style={{
                              fontSize: '0.7rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.2rem 0.5rem',
                            }}
                          >
                            <History size={11} /> View in History & Rollback
                          </button>
                          <a
                            href={getVersionDownloadUrl(projectId || dataset?.project_id, dataset?.id, item.version?.version_number ?? 1, 'csv')}
                            download
                            onClick={(e) => {
                              e.preventDefault()
                              handleDownloadVersion(item.version?.version_number ?? 1, 'csv')
                            }}
                            className="btn btn-xs btn-outline"
                            style={{
                              fontSize: '0.7rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                              padding: '0.2rem 0.45rem',
                            }}
                          >
                            <Download size={11} /> {downloadingVersion === `${item.version?.version_number ?? 1}_csv` ? 'Downloading...' : 'CSV'}
                          </a>
                          <a
                            href={getVersionDownloadUrl(projectId || dataset?.project_id, dataset?.id, item.version?.version_number ?? 1, 'parquet')}
                            download
                            onClick={(e) => {
                              e.preventDefault()
                              handleDownloadVersion(item.version?.version_number ?? 1, 'parquet')
                            }}
                            className="btn btn-xs btn-ghost"
                            style={{
                              fontSize: '0.7rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                              padding: '0.2rem 0.45rem',
                            }}
                          >
                            <Download size={11} /> {downloadingVersion === `${item.version?.version_number ?? 1}_parquet` ? 'Downloading...' : 'Parquet'}
                          </a>
                        </div>
                      </div>

                      {item.version.metrics_json && (
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                          <span>Rows: <strong style={{ color: 'var(--text-primary)' }}>{item.version.metrics_json.rows ?? 0}</strong></span>
                          <span>Columns: <strong style={{ color: 'var(--text-primary)' }}>{item.version.metrics_json.columns ?? 0}</strong></span>
                          <span>Nulls Remaining: <strong style={{ color: 'var(--text-primary)' }}>{item.version.metrics_json.total_null_pct ?? 0}%</strong></span>
                          {item.version.quality_score !== undefined && (
                            <span>Quality Score: <strong style={{ color: 'var(--emerald-primary)' }}>{item.version.quality_score}</strong></span>
                          )}
                        </div>
                      )}

                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        paddingTop: '0.35rem',
                        borderTop: '1px solid rgba(16, 185, 129, 0.15)',
                      }}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMode('comparison')
                            loadComparison()
                          }}
                          className="btn btn-xs btn-ghost"
                          style={{ fontSize: '0.7rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          <GitCompare size={11} /> View Before/After Comparison Diff
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '2rem 1rem',
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
            }}>
              <MessageSquare size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
              <p style={{ margin: '0 0 0.35rem 0', fontWeight: 600, color: 'var(--text-secondary)' }}>
                No chat cleaning tasks run yet.
              </p>
              <p style={{ margin: 0, fontSize: '0.75rem' }}>
                Type your dataset requirements above or select a Quick Task Template to start.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODE 7: ML-Aware Evaluation & Generalization Benchmark (Phase 17) */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeMode === 'ml_evaluation' && (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-sm)',
          padding: '1.25rem',
          marginBottom: '1rem',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1.2rem',
            paddingBottom: '0.85rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Brain size={16} color="var(--cyan-primary, #06b6d4)" />
                  ML-Aware Holdout Evaluation & Generalization Benchmark
                </span>
                <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>
                  Phase 17
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: 0 }}>
                Benchmarks machine learning performance on an 80/20 train/test split strictly held out before data cleaning to verify generalization and eliminate target leakage.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-green" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <ShieldCheck size={12} /> Zero Target Leakage Guard
              </span>
              {mlReport?.model_name && (
                <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>
                  {mlReport.model_name}
                </span>
              )}
            </div>
          </div>

          {/* Quick Target & Task Selector Bar */}
          <div style={{
            background: 'var(--bg-main)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Target size={13} color="var(--text-muted)" />
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Target Column:</label>
                {columns.length > 0 ? (
                  <select
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    disabled={mlLoading}
                    className="select-input"
                    style={{
                      fontSize: '0.76rem',
                      padding: '0.25rem 0.55rem',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <option value="">-- Auto-Detect Target --</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. Price, Target"
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    disabled={mlLoading}
                    style={{
                      fontSize: '0.76rem',
                      padding: '0.25rem 0.55rem',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-sm)',
                      width: '130px',
                    }}
                  />
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Activity size={13} color="var(--text-muted)" />
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>ML Task:</label>
                <select
                  value={selectedTask}
                  onChange={(e) => setSelectedTask(e.target.value)}
                  disabled={mlLoading}
                  className="select-input"
                  style={{
                    fontSize: '0.76rem',
                    padding: '0.25rem 0.55rem',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <optgroup label="Regression Tasks (Numeric Targets)">
                    <option value="REGRESSION">Regression (General)</option>
                    <option value="LINEAR_REGRESSION">Linear Regression (Scale & Outliers)</option>
                    <option value="CONTINUOUS_REGRESSION">Continuous Regression (Target Impute)</option>
                    <option value="POLYNOMIAL_REGRESSION">Polynomial Regression (Feature Curves)</option>
                  </optgroup>
                  <optgroup label="Classification Tasks (Categorical / Discrete Targets)">
                    <option value="CLASSIFICATION">Classification (General)</option>
                    <option value="BINARY_CLASSIFICATION">Binary Classification (0/1 Balanced)</option>
                    <option value="MULTICLASS_CLASSIFICATION">Multi-Class Classification</option>
                    <option value="LOGISTIC_REGRESSION">Logistic Regression (Clean & Encode)</option>
                  </optgroup>
                </select>
              </div>

              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Split: <strong style={{ color: 'var(--text-primary)' }}>80% Train / 20% Holdout</strong>
              </div>
            </div>

            <button
              onClick={() => handleRunMlEvaluation()}
              disabled={mlLoading}
              className="btn btn-sm btn-primary"
              style={{
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.85rem',
                background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
                borderColor: '#06b6d4',
              }}
            >
              {mlLoading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
              {mlLoading ? 'Benchmarking...' : 'Re-Run ML Benchmark'}
            </button>
          </div>

          {/* Loading Animation */}
          {mlLoading && (
            <div style={{
              background: 'var(--bg-main)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              marginBottom: '1rem',
            }}>
              <Loader2 size={32} className="spin" style={{ color: 'var(--cyan-primary, #06b6d4)', margin: '0 auto 1rem' }} />
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Executing ML Generalization Benchmark...
              </h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto' }}>
                Partitioning dataset into 80/20 train/test holdout &bull; Fitting baseline model on raw uncleaned data &bull; Fitting model on cleaned dataset &bull; Evaluating holdout R², RMSE, MAE or F1, Accuracy with zero leakage.
              </p>
            </div>
          )}

          {/* Case 1: Skipped Reason */}
          {!mlLoading && mlReport && mlReport.status === 'SKIPPED' && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: 'var(--radius-sm)',
              padding: '1.25rem',
              marginBottom: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#f59e0b', fontWeight: 600 }}>
                <AlertTriangle size={16} />
                <span>ML Evaluation Skipped</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem 0' }}>
                {mlReport.skip_reason || 'ML evaluation requires a supervised task type (Regression or Classification) and a designated target column.'}
              </p>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                👉 Select a target column from the dropdown above and choose a regression (e.g. Linear Regression, Continuous Regression) or classification task, then click <strong>Re-Run ML Benchmark</strong>.
              </div>
            </div>
          )}

          {/* Case 2: No Report Yet */}
          {!mlLoading && !mlReport && (
            <div style={{
              textAlign: 'center',
              padding: '2.5rem 1rem',
              color: 'var(--text-muted)',
              fontSize: '0.825rem',
            }}>
              <Brain size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4, color: 'var(--cyan-primary, #06b6d4)' }} />
              <p style={{ margin: '0 0 0.35rem 0', fontWeight: 600, color: 'var(--text-primary)' }}>
                No ML Evaluation Benchmark Run Yet
              </p>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '480px', marginInline: 'auto' }}>
                Evaluate how data cleaning transformations (imputation, outlier clipping, surrogate ID removal) impact model generalization on held-out test data.
              </p>
              <button
                onClick={() => handleRunMlEvaluation()}
                className="btn btn-sm btn-primary"
                style={{
                  fontSize: '0.8rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 1rem',
                  background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
                  borderColor: '#06b6d4',
                }}
              >
                <Brain size={13} /> Run ML Evaluation Benchmark
              </button>
            </div>
          )}

          {/* Case 3: SUCCESS Report */}
          {!mlLoading && mlReport && mlReport.status === 'SUCCESS' && (
            <div>
              {/* Zero-Leakage Guarantee Banner */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(6, 182, 212, 0.08))',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                fontSize: '0.78rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <ShieldCheck size={16} color="var(--emerald-primary)" />
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {mlReport.leakage_guard_notice}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  <span>Train: <strong style={{ color: 'var(--text-primary)' }}>{mlReport.train_samples}</strong> rows</span>
                  <span>Test: <strong style={{ color: 'var(--text-primary)' }}>{mlReport.test_samples}</strong> rows (20%)</span>
                  <span>Features: <strong style={{ color: 'var(--text-primary)' }}>{mlReport.feature_count}</strong></span>
                </div>
              </div>

              {/* Headline Metric Cards Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}>
                {/* Card 1: Primary Headline Metric */}
                <div style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Headline: {mlReport.primary_metric_name}
                    </span>
                    <span
                      className={`badge ${mlReport.primary_improved ? 'badge-green' : 'badge-rose'}`}
                      style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      {mlReport.primary_improved ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {mlReport.primary_improvement_pct >= 0 ? `+${mlReport.primary_improvement_pct.toFixed(1)}%` : `${mlReport.primary_improvement_pct.toFixed(1)}%`}
                    </span>
                  </div>

                  <div style={{ fontSize: '1.6rem', fontWeight: 700, color: mlReport.primary_improved ? 'var(--emerald-primary)' : 'var(--text-primary)' }}>
                    {typeof mlReport.primary_cleaned_score === 'number' ? mlReport.primary_cleaned_score.toFixed(3) : mlReport.primary_cleaned_score}
                  </div>

                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    Raw baseline: <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{typeof mlReport.primary_raw_score === 'number' ? mlReport.primary_raw_score.toFixed(3) : mlReport.primary_raw_score}</span>
                    <span style={{ marginLeft: '0.4rem', color: mlReport.primary_improved ? 'var(--emerald-primary)' : '#f43f5e', fontWeight: 600 }}>
                      ({mlReport.primary_cleaned_score >= mlReport.primary_raw_score ? '+' : ''}{(mlReport.primary_cleaned_score - mlReport.primary_raw_score).toFixed(3)})
                    </span>
                  </div>
                </div>

                {/* Card 2, 3, etc.: Secondary Metrics */}
                {mlReport.metrics.filter((m) => m.metric_name !== mlReport.primary_metric_name).slice(0, 3).map((m, idx) => (
                  <div key={idx} style={{
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        {m.metric_name}
                      </span>
                      <span
                        className={`badge ${m.is_improved ? 'badge-green' : 'badge-muted'}`}
                        style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                      >
                        {m.is_improved ? <TrendingUp size={11} /> : null}
                        {m.percent_change >= 0 ? `+${m.percent_change.toFixed(1)}%` : `${m.percent_change.toFixed(1)}%`}
                      </span>
                    </div>

                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: m.is_improved ? 'var(--emerald-primary)' : 'var(--text-primary)' }}>
                      {typeof m.cleaned_score === 'number' ? m.cleaned_score.toFixed(3) : m.cleaned_score}
                    </div>

                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      Raw baseline: <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{typeof m.raw_score === 'number' ? m.raw_score.toFixed(3) : m.raw_score}</span>
                      <span style={{ marginLeft: '0.4rem', color: m.is_improved ? 'var(--emerald-primary)' : 'var(--text-muted)', fontWeight: 600 }}>
                        ({m.delta >= 0 ? '+' : ''}{m.delta.toFixed(3)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Full Metrics Comparison Breakdown Table */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem 1rem',
                marginBottom: '1rem',
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.65rem' }}>
                  Complete Holdout Metrics Comparison
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>Evaluation Metric</th>
                        <th style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>Raw Dataset (Baseline)</th>
                        <th style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>Cleaned Dataset (Holdout)</th>
                        <th style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>Net Delta</th>
                        <th style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mlReport.metrics.map((m, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {m.metric_name}
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                            {typeof m.raw_score === 'number' ? m.raw_score.toFixed(4) : m.raw_score}
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: m.is_improved ? 'var(--emerald-primary)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                            {typeof m.cleaned_score === 'number' ? m.cleaned_score.toFixed(4) : m.cleaned_score}
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem', fontFamily: 'var(--font-mono)', color: m.is_improved ? 'var(--emerald-primary)' : '#f43f5e' }}>
                            {m.delta >= 0 ? `+${m.delta.toFixed(4)}` : m.delta.toFixed(4)} ({m.percent_change >= 0 ? `+${m.percent_change.toFixed(1)}%` : `${m.percent_change.toFixed(1)}%`})
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem' }}>
                            <span className={`badge ${m.is_improved ? 'badge-green' : 'badge-muted'}`} style={{ fontSize: '0.65rem' }}>
                              {m.is_improved ? 'IMPROVED' : 'MAINTAINED'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Predictive Feature Importance (Top Features) */}
              {mlReport.top_features && mlReport.top_features.length > 0 && (
                <div style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem 1rem',
                  marginBottom: '1rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <BarChart2 size={13} color="var(--emerald-primary)" />
                      Top Predictive Features (Cleaned Model Importance)
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Model: {mlReport.model_name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {mlReport.top_features.map((feat, idx) => {
                      const pct = Math.round(feat.importance * 100)
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.76rem' }}>
                          <span style={{ minWidth: '130px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {feat.feature}
                          </span>
                          <div style={{ flex: 1, height: '8px', background: 'var(--bg-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.max(4, Math.min(100, pct))}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #06b6d4, #10b981)',
                              borderRadius: '4px',
                            }} />
                          </div>
                          <span style={{ minWidth: '45px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {pct}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Executive Summary Callout */}
              {mlReport.summary && (
                <div style={{
                  background: 'rgba(6, 182, 212, 0.06)',
                  border: '1px solid rgba(6, 182, 212, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem 1rem',
                  fontSize: '0.78rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.5,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, color: 'var(--cyan-primary, #06b6d4)', marginBottom: '0.25rem' }}>
                    <Award size={13} />
                    <span>ML Benchmark Executive Summary</span>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    {mlReport.summary}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODE 8: Comprehensive Reporting & Audit Export (Phase 18)     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeMode === 'audit_report' && (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-sm)',
          padding: '1.25rem',
          marginBottom: '1rem',
        }}>
          {/* Header & Export Actions Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1.2rem',
            paddingBottom: '0.85rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <FileCheck size={16} color="var(--emerald-primary)" />
                  Comprehensive Data Audit & Quality Report
                </span>
                <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>
                  Phase 18
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: 0 }}>
                Synthesizes data quality metrics, detected issues, applied transformations, version lineage, and ML generalization into an audit document.
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => loadAuditReport()}
                disabled={auditLoading}
                className="btn btn-xs btn-ghost"
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                title="Refresh audit report data"
              >
                <RefreshCw size={12} className={auditLoading ? 'animate-spin' : ''} /> Refresh
              </button>
              <button
                type="button"
                onClick={() => handleDownloadAuditReport('json')}
                disabled={auditDownloading === 'json' || auditLoading}
                className="btn btn-xs btn-ghost"
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              >
                {auditDownloading === 'json' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Export JSON
              </button>
              <button
                type="button"
                onClick={handleOpenHtmlReport}
                disabled={auditLoading}
                className="btn btn-xs btn-primary"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.3rem 0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'linear-gradient(135deg, #059669, #0d9488)',
                  borderColor: '#059669',
                }}
              >
                <Printer size={12} /> View / Print HTML Report <ExternalLink size={11} />
              </button>
            </div>
          </div>

          {/* Loading Spinner */}
          {auditLoading && !auditReport && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: 'var(--emerald-primary)' }} />
              <p style={{ margin: 0, fontSize: '0.85rem' }}>Compiling verifiable audit report and calculating quality deltas...</p>
            </div>
          )}

          {/* Error Banner */}
          {auditError && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              borderRadius: 'var(--radius-sm)',
              padding: '1rem',
              marginBottom: '1rem',
              color: '#f43f5e',
              fontSize: '0.8rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.25rem', fontWeight: 600 }}>
                <AlertTriangle size={15} /> Failed to generate audit report
              </div>
              <div>{auditError}</div>
              <button
                onClick={() => loadAuditReport()}
                className="btn btn-xs"
                style={{ marginTop: '0.5rem', background: '#f43f5e', color: '#fff' }}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Report Content */}
          {!auditLoading && auditReport && (
            <div>
              {/* Executive Summary Card with Grade */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '1.25rem',
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
              }}>
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Executive Summary • {auditReport.dataset_overview.dataset_name}
                    </span>
                    <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>
                      Version v{auditReport.dataset_overview.current_version}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.55 }}>
                    {auditReport.final_quality_summary}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  background: 'var(--bg-surface)',
                  padding: '0.75rem 1.25rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Health Grade
                    </div>
                    <div style={{
                      fontSize: '2rem',
                      fontWeight: 900,
                      color: getGradeColor(auditReport.quality_metrics.health_grade_after),
                      lineHeight: 1.1,
                    }}>
                      {auditReport.quality_metrics.health_grade_after}
                    </div>
                  </div>
                  <div style={{ borderLeft: '1px solid var(--border-medium)', paddingLeft: '1rem' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Quality Score</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {auditReport.quality_metrics.after_score.toFixed(1)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ 100</span>
                    </div>
                    <div style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: auditReport.quality_metrics.score_delta >= 0 ? 'var(--emerald-primary)' : '#f43f5e',
                    }}>
                      {auditReport.quality_metrics.score_delta >= 0 ? `+${auditReport.quality_metrics.score_delta.toFixed(1)}` : auditReport.quality_metrics.score_delta.toFixed(1)} pts
                    </div>
                  </div>
                </div>
              </div>

              {/* Warnings and Caveats Alert */}
              {auditReport.warnings_and_caveats && auditReport.warnings_and_caveats.length > 0 && (
                <div style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderLeft: '4px solid #f59e0b',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem 1rem',
                  marginBottom: '1rem',
                  fontSize: '0.78rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f59e0b', fontWeight: 600, marginBottom: '0.35rem' }}>
                    <AlertTriangle size={14} /> Operational Warnings & Quality Caveats
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                    {auditReport.warnings_and_caveats.map((w, idx) => (
                      <li key={idx} style={{ marginBottom: '0.2rem' }}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 4-Stat Overview Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}>
                <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Original Dimensions</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {auditReport.dataset_overview.original_shape.rows.toLocaleString()} × {auditReport.dataset_overview.original_shape.columns}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>rows × columns at ingest</div>
                </div>

                <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Cleaned Dimensions</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--emerald-primary)', fontFamily: 'var(--font-mono)' }}>
                    {auditReport.dataset_overview.current_shape.rows.toLocaleString()} × {auditReport.dataset_overview.current_shape.columns}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    net rows altered: {(auditReport.dataset_overview.original_shape.rows - auditReport.dataset_overview.current_shape.rows).toLocaleString()}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Target & Task</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {auditReport.dataset_overview.task_type}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    target: {auditReport.dataset_overview.target_column || 'None (Unsupervised)'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Defect Remediation</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    {auditReport.issues_resolved_count} / {auditReport.detected_issues.length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {auditReport.issues_remaining_count} remaining open defect(s)
                  </div>
                </div>
              </div>

              {/* 4-Factor Quality Breakdown Table */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem 1rem',
                marginBottom: '1rem',
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Sliders size={13} color="var(--emerald-primary)" />
                  4-Factor Dataset Quality Score Breakdown (0–100 Scale)
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>Quality Metric</th>
                        <th style={{ padding: '0.35rem 0.5rem', fontWeight: 500, textAlign: 'right' }}>Weight</th>
                        <th style={{ padding: '0.35rem 0.5rem', fontWeight: 500, textAlign: 'right' }}>Baseline (Raw)</th>
                        <th style={{ padding: '0.35rem 0.5rem', fontWeight: 500, textAlign: 'right' }}>Cleaned (v{auditReport.dataset_overview.current_version})</th>
                        <th style={{ padding: '0.35rem 0.5rem', fontWeight: 500, textAlign: 'right' }}>Net Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>Completeness Score (100 - Null %)</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>35%</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{auditReport.quality_metrics.completeness_before.toFixed(1)}</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{auditReport.quality_metrics.completeness_after.toFixed(1)}</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: auditReport.quality_metrics.completeness_delta >= 0 ? 'var(--emerald-primary)' : '#f43f5e', fontWeight: 700 }}>
                          {auditReport.quality_metrics.completeness_delta >= 0 ? `+${auditReport.quality_metrics.completeness_delta.toFixed(1)}` : auditReport.quality_metrics.completeness_delta.toFixed(1)}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>Type Consistency Score</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>25%</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{auditReport.quality_metrics.type_consistency_before.toFixed(1)}</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{auditReport.quality_metrics.type_consistency_after.toFixed(1)}</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: auditReport.quality_metrics.type_consistency_delta >= 0 ? 'var(--emerald-primary)' : '#f43f5e', fontWeight: 700 }}>
                          {auditReport.quality_metrics.type_consistency_delta >= 0 ? `+${auditReport.quality_metrics.type_consistency_delta.toFixed(1)}` : auditReport.quality_metrics.type_consistency_delta.toFixed(1)}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>Uniqueness Score (100 - Duplicate %)</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>20%</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{auditReport.quality_metrics.uniqueness_before.toFixed(1)}</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{auditReport.quality_metrics.uniqueness_after.toFixed(1)}</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: auditReport.quality_metrics.uniqueness_delta >= 0 ? 'var(--emerald-primary)' : '#f43f5e', fontWeight: 700 }}>
                          {auditReport.quality_metrics.uniqueness_delta >= 0 ? `+${auditReport.quality_metrics.uniqueness_delta.toFixed(1)}` : auditReport.quality_metrics.uniqueness_delta.toFixed(1)}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>Validity Score (Domain & Range)</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>20%</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{auditReport.quality_metrics.validity_before.toFixed(1)}</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{auditReport.quality_metrics.validity_after.toFixed(1)}</td>
                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: auditReport.quality_metrics.validity_delta >= 0 ? 'var(--emerald-primary)' : '#f43f5e', fontWeight: 700 }}>
                          {auditReport.quality_metrics.validity_delta >= 0 ? `+${auditReport.quality_metrics.validity_delta.toFixed(1)}` : auditReport.quality_metrics.validity_delta.toFixed(1)}
                        </td>
                      </tr>
                      <tr style={{ background: 'var(--bg-surface)', fontWeight: 700 }}>
                        <td style={{ padding: '0.55rem 0.5rem' }}>Composite Overall Quality Score</td>
                        <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>100%</td>
                        <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{auditReport.quality_metrics.before_score.toFixed(1)} ({auditReport.quality_metrics.health_grade_before})</td>
                        <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: getGradeColor(auditReport.quality_metrics.health_grade_after) }}>{auditReport.quality_metrics.after_score.toFixed(1)} ({auditReport.quality_metrics.health_grade_after})</td>
                        <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: auditReport.quality_metrics.score_delta >= 0 ? 'var(--emerald-primary)' : '#f43f5e' }}>
                          {auditReport.quality_metrics.score_delta >= 0 ? `+${auditReport.quality_metrics.score_delta.toFixed(1)}` : auditReport.quality_metrics.score_delta.toFixed(1)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ML Performance Benchmark Card (if run) */}
              {auditReport.ml_performance && auditReport.ml_performance.status === 'SUCCESS' && (
                <div style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem 1rem',
                  marginBottom: '1rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Brain size={13} color="var(--cyan-primary, #06b6d4)" />
                      Machine Learning Generalization Holdout Delta
                    </div>
                    <span className="badge badge-green" style={{ fontSize: '0.68rem' }}>
                      {auditReport.ml_performance.model_name} • {auditReport.ml_performance.primary_metric_name}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.76rem' }}>
                    <div style={{ background: 'var(--bg-surface)', padding: '0.65rem', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Primary Metric Improvement</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: auditReport.ml_performance.primary_improved ? 'var(--emerald-primary)' : '#f43f5e' }}>
                        {auditReport.ml_performance.primary_raw_score?.toFixed(3)} → {auditReport.ml_performance.primary_cleaned_score?.toFixed(3)}
                        <span style={{ fontSize: '0.72rem', marginLeft: '0.35rem' }}>
                          ({auditReport.ml_performance.primary_improvement_pct >= 0 ? '+' : ''}{auditReport.ml_performance.primary_improvement_pct?.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-surface)', padding: '0.65rem', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Holdout Split (Zero Leakage)</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {auditReport.ml_performance.train_samples} train / {auditReport.ml_performance.test_samples} test rows (20%)
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Detected Issues Inventory Table */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem 1rem',
                marginBottom: '1rem',
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.65rem' }}>
                  Data Quality Issues Inventory ({auditReport.detected_issues.length})
                </div>
                <div style={{ overflowX: 'auto', maxHeight: '240px' }}>
                  <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Severity</th>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Issue Type</th>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Column</th>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Details</th>
                        <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditReport.detected_issues.map((iss, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '0.4rem 0.5rem' }}>
                            <span className={`badge ${iss.severity === 'CRITICAL' || iss.severity === 'HIGH' ? 'badge-rose' : (iss.severity === 'MEDIUM' ? 'badge-amber' : 'badge-muted')}`} style={{ fontSize: '0.65rem' }}>
                              {iss.severity}
                            </span>
                          </td>
                          <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'var(--font-mono)' }}>{iss.issue_type}</td>
                          <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'var(--font-mono)' }}>{iss.column_name || 'all'}</td>
                          <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-secondary)' }}>{iss.description}</td>
                          <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                            <span className={`badge ${iss.status === 'RESOLVED' ? 'badge-green' : 'badge-rose'}`} style={{ fontSize: '0.65rem' }}>
                              {iss.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Applied Transformations Table */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem 1rem',
                marginBottom: '1rem',
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.65rem' }}>
                  Applied Transformations & Clean Actions ({auditReport.applied_transformations.length})
                </div>
                <div style={{ overflowX: 'auto', maxHeight: '240px' }}>
                  <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Operation Tool</th>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Target Columns</th>
                        <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Rows Affected</th>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Action Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditReport.applied_transformations.map((tr, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{tr.tool_name}</td>
                          <td style={{ padding: '0.4rem 0.5rem' }}>{tr.columns_affected?.join(', ') || '-'}</td>
                          <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{tr.rows_affected.toLocaleString()}</td>
                          <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-secondary)' }}>{tr.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Reversible Version History Lineage */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem 1rem',
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <History size={13} color="var(--emerald-primary)" />
                  Reversible Version Lineage Milestones ({auditReport.version_timeline.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {auditReport.version_timeline.map((v, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.65rem',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.76rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <span className="badge badge-primary" style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>
                          v{v.version_number}
                        </span>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{v.action_summary}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{v.created_at.slice(0, 19).replace('T', ' ')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        {v.quality_score && (
                          <span style={{ fontWeight: 600, color: 'var(--emerald-primary)' }}>
                            Score: {v.quality_score.toFixed(1)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDownloadVersion(v.version_number, 'csv')}
                          className="btn btn-xs btn-ghost"
                          style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                        >
                          <Download size={11} /> CSV
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
