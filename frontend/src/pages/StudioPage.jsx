import React, { useState } from 'react'
import {
  RefreshCw,
  FileSpreadsheet,
  AlertCircle,
  Database,
  ArrowRight,
  Download,
  Loader2,
  CheckCircle2,
  Table,
  ShieldAlert,
  Sparkles,
  FolderPlus,
  Plus
} from 'lucide-react'
import UploadZone from '../components/UploadZone'
import ProfileStats from '../components/ProfileStats'
import IssuesList from '../components/IssuesList'
import ColumnsExplorer from '../components/ColumnsExplorer'
import LlmSummaryCard from '../components/LlmSummaryCard'
import CleanActionCard from '../components/CleanActionCard'
import AiInsightsCard from '../components/AiInsightsCard'
import { createProject } from '../api'

const QUICK_SAMPLES = [
  {
    name: 'Titanic Survival',
    task: 'CLASSIFICATION',
    url: 'https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv',
    filename: 'titanic.csv',
    note: 'Classification & surrogate key drop',
  },
  {
    name: 'IBM Telco Churn',
    task: 'CLASSIFICATION',
    url: 'https://raw.githubusercontent.com/IBM/telco-customer-churn-on-icp4d/master/data/Telco-Customer-Churn.csv',
    filename: 'Telco-Customer-Churn.csv',
    note: 'Type mismatch & string numbers',
  },
  {
    name: 'Adult Census',
    task: 'CLASSIFICATION',
    url: 'https://raw.githubusercontent.com/guru99-edu/R-Programming/master/adult_data.csv',
    filename: 'adult_census_income.csv',
    note: 'Index column & demographics',
  },
  {
    name: 'NASA Exoplanets',
    task: 'REGRESSION',
    url: 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/planets.csv',
    filename: 'nasa_planets.csv',
    note: 'Continuous regression & missingness',
  },
]

export default function StudioPage({
  project,
  projects = [],
  onSelectProject,
  onRefreshProjects,
  activeDataset,
  profileData,
  issuesData,
  isUploading,
  uploadProgress,
  error,
  isCleaning,
  setIsCleaning,
  onUploadAndProfile,
  onReset,
  onErrorDismiss,
  onDatasetCleaned,
}) {
  const [loadingSample, setLoadingSample] = useState(null)
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)

  const handleQuickLoad = async (sample) => {
    setLoadingSample(sample.name)
    try {
      const res = await fetch(sample.url)
      const blob = await res.blob()
      const file = new File([blob], sample.filename, { type: 'text/csv' })
      await onUploadAndProfile(file, sample.task, project?.id)
    } catch (err) {
      console.error('Failed to load sample dataset:', err)
    } finally {
      setLoadingSample(null)
    }
  }

  const handleCreateProjectInline = async (e) => {
    e.preventDefault()
    if (!newProjectName.trim()) return
    setCreatingProject(true)
    try {
      const res = await createProject(newProjectName.trim(), 'Interactive cleaning workspace')
      if (res?.project) {
        if (onSelectProject) onSelectProject(res.project)
        if (onRefreshProjects) await onRefreshProjects()
      }
      setNewProjectName('')
      setShowNewProjectModal(false)
    } catch (err) {
      alert(`Could not create project: ${err.message}`)
    } finally {
      setCreatingProject(false)
    }
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Studio Header Bar */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
            <FileSpreadsheet size={18} color="var(--text-secondary)" />
            <h1 style={{ fontSize: '1.35rem', fontWeight: 600 }}>
              {activeDataset ? activeDataset.original_filename : 'Data Studio'}
            </h1>
            {profileData && (
              <span className="badge badge-muted" style={{ textTransform: 'uppercase' }}>
                {profileData.file_type || 'CSV'}
              </span>
            )}
            {activeDataset && (
              <span className="badge badge-green">
                Profiled
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
            {activeDataset
              ? `Associated with project: ${project?.name || 'Studio Project'} &bull; Ingested via streaming Polars`
              : 'Interactive workspace for deterministic data profiling, defect diagnosis, and task cleaning.'}
          </p>
        </div>

        {activeDataset && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={onReset}
              className="btn btn-secondary btn-sm"
              disabled={isUploading || isCleaning}
            >
              <RefreshCw size={13} />
              Upload Another File
            </button>
          </div>
        )}
      </div>

      {/* Global Error Banner */}
      {error && (
        <div style={{
          background: 'var(--rose-bg)',
          border: '1px solid var(--rose-border)',
          color: 'var(--rose-primary)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.85rem',
        }}>
          <div>
            <strong>Error:</strong> {error}
          </div>
          <button
            onClick={onErrorDismiss}
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--rose-primary)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* State A: No Dataset Loaded Yet -> Project Target Bar + Centered Ingest Box + Quick Benchmarks */}
      {!profileData && (
        <div>
          {/* Project Selector Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.65rem 1rem',
            marginBottom: '1.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <FolderPlus size={16} color="var(--text-secondary)" />
              <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>Target Project:</span>
              {projects && projects.length > 0 ? (
                <select
                  value={project?.id || ''}
                  onChange={(e) => {
                    const found = projects.find(p => p.id === e.target.value)
                    if (found && onSelectProject) onSelectProject(found)
                  }}
                  className="select-input"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    color: 'var(--text-primary)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.825rem',
                    outline: 'none',
                  }}
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {project?.name || 'Default Data Studio'}
                </span>
              )}
            </div>

            <button
              onClick={() => setShowNewProjectModal(true)}
              className="btn btn-secondary btn-xs"
            >
              <Plus size={12} /> New Project
            </button>
          </div>

          <UploadZone
            onUploadComplete={(file, taskType) => onUploadAndProfile(file, taskType, project?.id)}
            isUploading={isUploading || loadingSample !== null}
            uploadProgress={uploadProgress}
          />

          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
              Or start immediately with a benchmark dataset:
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem' }}>
              {QUICK_SAMPLES.map((s) => (
                <button
                  key={s.name}
                  onClick={() => handleQuickLoad(s)}
                  disabled={isUploading || loadingSample !== null}
                  className="btn btn-secondary btn-sm"
                  style={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    padding: '0.65rem 0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '0.2rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {loadingSample === s.name ? <Loader2 size={13} className="spin" /> : <Database size={13} />}
                    {s.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {s.note}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* State B: Dataset Ingested & Profiled -> Relocated Smooth Flow */}
      {profileData && (
        <div>
          {/* 1. Summary KPI Metrics */}
          <ProfileStats profile={profileData} issues={issuesData} />

          {/* 2. Groq LLM Autonomous Agent: Iterative Diagnosis & Cleaning Loop */}
          <AiInsightsCard
            dataset={activeDataset}
            projectId={activeDataset?.project_id || project?.id}
            profile={profileData}
            issues={issuesData}
            taskType={activeDataset?.task_type || 'GENERAL'}
            onDatasetCleaned={onDatasetCleaned}
          />

          {/* 3. Task-Aware Cleaning & Download Engine */}
          <CleanActionCard
            dataset={activeDataset}
            projectId={activeDataset?.project_id || project?.id}
            profile={profileData}
            isCleaning={isCleaning}
            setIsCleaning={setIsCleaning}
          />

          {/* 3. Detailed Quality Issues Detected */}
          <IssuesList issues={issuesData} />

          {/* 4. Column Schema Explorer */}
          <ColumnsExplorer columns={profileData.columns || []} />

          {/* 5. Telemetry & Context */}
          <LlmSummaryCard summary={profileData.llm_summary} />
        </div>
      )}

      {/* Create Project Inline Modal */}
      {showNewProjectModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '1.75rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Create New Project
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
              Create a workspace container to isolate this dataset and its cleaning rules.
            </p>

            <form onSubmit={handleCreateProjectInline}>
              <div style={{ marginBottom: '1.25rem' }}>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Q3 Sales Data"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowNewProjectModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingProject || !newProjectName.trim()}
                  className="btn btn-primary btn-sm"
                >
                  {creatingProject ? 'Creating...' : 'Create & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
