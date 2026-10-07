import React, { useState, useEffect } from 'react'
import {
  Database,
  FolderPlus,
  Trash2,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
  RefreshCw,
  Loader2,
  Lock,
  Plus,
  Upload,
  Sparkles,
  Filter,
  Layers,
  ChevronDown
} from 'lucide-react'
import {
  fetchProjects,
  createProject,
  deleteProject,
  fetchUserDatasets,
  deleteDataset,
  getDownloadUrl,
  addSampleDataset
} from '../api'
import DeleteConfirmModal from '../components/DeleteConfirmModal'

const BENCHMARK_SAMPLES = [
  {
    key: 'telco_churn',
    name: 'IBM Telco Churn (Classification)',
    target: 'churn',
    issues: 'Missing total charges, duplicate customers, string numbers',
    desc: '50 rows with common real-world defect patterns in telecom customer metrics.',
  },
  {
    key: 'titanic',
    name: 'Titanic Passengers (Classification)',
    target: 'survived',
    issues: 'Missing age & cabin, duplicate rows, passenger name identifiers',
    desc: 'Classic ML problem with missing demographics, survival targets, and identifiers.',
  },
  {
    key: 'housing',
    name: 'Housing Prices (Regression)',
    target: 'price',
    issues: 'Missing square footage, negative outliers, constant country column',
    desc: 'Real-estate regression dataset with price outliers and zero-variance features.',
  },
]

export default function ProjectsPage({
  user,
  onOpenAuth,
  onOpenDatasetInStudio,
  onNavigate,
  onSelectProjectForUpload,
  onRefreshProjects,
}) {
  const [projects, setProjects] = useState([])
  const [datasets, setDatasets] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('datasets') // 'datasets' or 'projects'
  const [projectFilter, setProjectFilter] = useState('ALL')
  const [sampleModalProject, setSampleModalProject] = useState(null)
  const [addingSampleKey, setAddingSampleKey] = useState(null)
  const [successBanner, setSuccessBanner] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [projList, dsList] = await Promise.all([
        fetchProjects().catch(() => []),
        fetchUserDatasets().catch(() => []),
      ])
      setProjects(projList)
      setDatasets(dsList)
      if (onRefreshProjects) onRefreshProjects()
    } catch (err) {
      console.error(err)
      setError('Could not load your workspace history.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const handleCreateProject = async (e) => {
    e.preventDefault()
    if (!newProjectName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await createProject(newProjectName.trim(), 'Interactive cleaning workspace')
      setNewProjectName('')
      setShowCreateModal(false)
      await loadData()
      if (res?.project) {
        setSuccessBanner(`Project "${res.project.name}" created successfully.`)
        setTimeout(() => setSuccessBanner(null), 4000)
      }
    } catch (err) {
      setError(err.message || 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  // Card-based Deletion Modal State (replaces browser confirm)
  const [datasetToDelete, setDatasetToDelete] = useState(null)
  const [projectToDelete, setProjectToDelete] = useState(null)
  const [isDeletingAction, setIsDeletingAction] = useState(false)
  const [deleteModalError, setDeleteModalError] = useState(null)

  const onRequestDeleteDataset = (dataset) => {
    setDeleteModalError(null)
    setDatasetToDelete(dataset)
  }

  const handleConfirmDeleteDataset = async () => {
    if (!datasetToDelete) return
    setIsDeletingAction(true)
    setDeleteModalError(null)
    try {
      await deleteDataset(datasetToDelete.project_id, datasetToDelete.id)
      setDatasets(prev => prev.filter(d => d.id !== datasetToDelete.id))
      const filename = datasetToDelete.original_filename
      setDatasetToDelete(null)
      setSuccessBanner(`Dataset "${filename}" was permanently deleted.`)
      setTimeout(() => setSuccessBanner(null), 3500)
    } catch (err) {
      console.error('Failed to delete dataset:', err)
      setDeleteModalError(err.message || 'Failed to delete dataset. Please try again.')
    } finally {
      setIsDeletingAction(false)
    }
  }

  const onRequestDeleteProject = (proj) => {
    setDeleteModalError(null)
    setProjectToDelete(proj)
  }

  const handleConfirmDeleteProject = async () => {
    if (!projectToDelete) return
    setIsDeletingAction(true)
    setDeleteModalError(null)
    try {
      await deleteProject(projectToDelete.id)
      setProjects(prev => prev.filter(p => p.id !== projectToDelete.id))
      setDatasets(prev => prev.filter(d => d.project_id !== projectToDelete.id))
      const projName = projectToDelete.name
      setProjectToDelete(null)
      setSuccessBanner(`Project "${projName}" and its datasets were permanently deleted.`)
      setTimeout(() => setSuccessBanner(null), 3500)
    } catch (err) {
      console.error('Failed to delete project:', err)
      setDeleteModalError(err.message || 'Failed to delete project. Please try again.')
    } finally {
      setIsDeletingAction(false)
    }
  }

  const handleOpenDataset = (d) => {
    if (onOpenDatasetInStudio) {
      onOpenDatasetInStudio(d)
    } else {
      onNavigate('studio')
    }
  }

  const handleAddSample = async (sampleKey) => {
    if (!sampleModalProject) return
    setAddingSampleKey(sampleKey)
    try {
      const res = await addSampleDataset(sampleModalProject.id, sampleKey)
      setSampleModalProject(null)
      await loadData()
      setSuccessBanner(res.message || 'Sample dataset added successfully!')
      setTimeout(() => setSuccessBanner(null), 4000)
    } catch (err) {
      alert(`Failed to add sample dataset: ${err.message}`)
    } finally {
      setAddingSampleKey(null)
    }
  }

  if (!user) {
    return (
      <div style={{ maxWidth: '650px', margin: '3rem auto', textAlign: 'center' }}>
        <div className="card" style={{ padding: '3rem 2rem' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-medium)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            color: 'var(--text-secondary)',
          }}>
            <Lock size={22} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            User Workspace & Dataset History
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
            Sign in to access your linked projects, manage datasets per project, and download cleaned exports (retained for 10 days).
          </p>

          <button
            onClick={onOpenAuth}
            className="btn btn-primary"
            style={{ padding: '0.65rem 1.75rem' }}
          >
            Sign In or Create Account
          </button>
        </div>
      </div>
    )
  }

  // Filter datasets
  const filteredDatasets = projectFilter === 'ALL'
    ? datasets
    : datasets.filter(d => d.project_id === projectFilter)

  return (
    <div style={{ maxWidth: '1150px', margin: '0 auto' }}>
      {/* Top Header */}
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
            <Database size={18} color="var(--text-secondary)" />
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600 }}>
              My Projects & Datasets
            </h1>
            <span className="badge badge-muted" style={{ fontFamily: 'var(--font-mono)' }}>
              {user.email || 'Authenticated User'}
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
            Organize datasets into specific projects. Datasets remain available for download for 10 days.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary btn-sm"
          >
            <FolderPlus size={14} />
            New Project
          </button>
          <button
            onClick={() => onNavigate('studio')}
            className="btn btn-secondary btn-sm"
          >
            <Upload size={14} />
            Upload Dataset
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="btn btn-ghost btn-sm"
            title="Refresh workspaces"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successBanner && (
        <div style={{
          background: 'var(--bg-subtle)',
          border: '1px solid var(--emerald-primary)',
          color: 'var(--text-primary)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.65rem 1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.85rem',
        }}>
          <CheckCircle2 size={16} color="var(--emerald-primary)" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* 10-Day Retention Notice */}
      <div style={{
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.75rem 1rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
      }}>
        <Clock size={16} color="var(--amber-primary)" />
        <span>
          <strong>10-Day Retention Policy:</strong> Datasets and cleaning outputs are stored and available for download for 10 days from ingestion, after which storage is safely reclaimed.
        </span>
      </div>

      {/* Tab Switcher & Filter Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.25rem'
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setActiveTab('datasets')}
            className={`btn btn-sm ${activeTab === 'datasets' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <FileSpreadsheet size={13} />
            Datasets ({datasets.length})
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`btn btn-sm ${activeTab === 'projects' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Layers size={13} />
            Projects ({projects.length})
          </button>
        </div>

        {activeTab === 'datasets' && projects.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={13} color="var(--text-secondary)" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Filter Project:</span>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="select-input"
              style={{
                padding: '0.35rem 0.65rem',
                fontSize: '0.8rem',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            >
              <option value="ALL">All Projects ({datasets.length})</option>
              {projects.map(p => {
                const count = datasets.filter(d => d.project_id === p.id).length
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} ({count})
                  </option>
                )
              })}
            </select>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
          <Loader2 size={24} className="spin" style={{ margin: '0 auto 0.5rem' }} />
          <div>Loading your datasets and workspaces...</div>
        </div>
      ) : activeTab === 'datasets' ? (
        /* Datasets List View */
        filteredDatasets.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
            <FileSpreadsheet size={36} color="var(--text-dim)" style={{ margin: '0 auto 0.75rem' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              {projectFilter === 'ALL' ? 'No datasets in your workspace yet' : 'No datasets in this project'}
            </h3>
            <p style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Upload your CSV dataset or add a benchmark sample to profile and clean it.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button onClick={() => onNavigate('studio')} className="btn btn-primary btn-sm">
                Upload Dataset <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredDatasets.map((d) => {
              const isDeleting = deletingId === d.id
              const downloadUrl = getDownloadUrl(d.project_id, d.id)

              return (
                <div
                  key={d.id}
                  className="card"
                  style={{
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                      <FileSpreadsheet size={16} color="var(--text-secondary)" />
                      <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        {d.original_filename}
                      </span>
                      <span className="badge badge-muted" style={{ textTransform: 'uppercase' }}>
                        {d.file_type}
                      </span>
                      {d.has_cleaned ? (
                        <span className="badge badge-green">Cleaned CSV Ready</span>
                      ) : (
                        <span className="badge badge-muted">Profiled</span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <span>
                        Project: <strong style={{ color: 'var(--text-primary)' }}>{d.project_name || 'Studio Project'}</strong>
                      </span>
                      {d.row_count && (
                        <span>{d.row_count.toLocaleString()} rows × {d.column_count} cols</span>
                      )}
                      <span>Uploaded {new Date(d.created_at).toLocaleDateString()}</span>
                    </div>

                    {/* Retention Countdown Pill */}
                    <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {d.is_expired ? (
                        <span className="badge badge-rose">
                          <Clock size={11} /> Expired (10-day retention elapsed)
                        </span>
                      ) : (
                        <span className={`badge ${d.days_remaining <= 1 ? 'badge-amber' : 'badge-muted'}`} style={{ fontSize: '0.7rem' }}>
                          <Clock size={11} />
                          {d.days_remaining > 0
                            ? `Available for ${d.days_remaining} more day${d.days_remaining > 1 ? 's' : ''}`
                            : `Expires in ${d.hours_remaining} hours`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleOpenDataset(d)}
                      className="btn btn-secondary btn-sm"
                      title="Open dataset in Data Studio"
                    >
                      Open in Studio
                    </button>

                    {d.has_cleaned && !d.is_expired && (
                      <a
                        href={downloadUrl}
                        download
                        className="btn btn-primary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                      >
                        <Download size={13} />
                        Download Cleaned
                      </a>
                    )}

                    <button
                      onClick={() => onRequestDeleteDataset(d)}
                      disabled={isDeletingAction && datasetToDelete?.id === d.id}
                      className="btn btn-ghost btn-sm"
                      title="Delete dataset permanently"
                      style={{ color: 'var(--rose-primary)' }}
                    >
                      {isDeletingAction && datasetToDelete?.id === d.id ? (
                        <Loader2 size={14} className="spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        /* Projects List View with Embedded Datasets */
        projects.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
            <FolderPlus size={36} color="var(--text-dim)" style={{ margin: '0 auto 0.75rem' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              No projects created yet
            </h3>
            <p style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Create a project workspace to group datasets together.
            </p>
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
              <Plus size={14} /> Create Project
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {projects.map((p) => {
              const isDeleting = deletingId === p.id
              const projDatasets = datasets.filter(d => d.project_id === p.id)

              return (
                <div key={p.id} className="card" style={{ padding: '1.25rem' }}>
                  {/* Project Header */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    marginBottom: '1rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.25rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {p.name}
                        </h3>
                        <span className="badge badge-muted">
                          {projDatasets.length} dataset{projDatasets.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
                        {p.description || 'Dedicated workspace container'} &bull; Created {new Date(p.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          if (onSelectProjectForUpload) {
                            onSelectProjectForUpload(p)
                          } else {
                            onNavigate('studio')
                          }
                        }}
                        className="btn btn-primary btn-sm"
                        title="Upload a new dataset directly to this project"
                      >
                        <Upload size={13} />
                        Upload Dataset
                      </button>

                      <button
                        onClick={() => setSampleModalProject(p)}
                        className="btn btn-secondary btn-sm"
                        title="Add a sample benchmark dataset into this project"
                      >
                        <Sparkles size={13} />
                        Add Sample
                      </button>

                      <button
                        onClick={() => onRequestDeleteProject(p)}
                        disabled={isDeletingAction && projectToDelete?.id === p.id}
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--rose-primary)' }}
                        title="Delete project workspace"
                      >
                        {isDeletingAction && projectToDelete?.id === p.id ? (
                          <Loader2 size={13} className="spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Datasets Inside This Project */}
                  <div>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      marginBottom: '0.6rem'
                    }}>
                      Datasets in this Project:
                    </div>

                    {projDatasets.length === 0 ? (
                      <div style={{
                        padding: '1.25rem',
                        background: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        textAlign: 'center',
                        fontSize: '0.825rem',
                        color: 'var(--text-muted)',
                        border: '1px dashed var(--border-subtle)',
                      }}>
                        No datasets in this project yet. Use "Upload Dataset" to upload a file or "Add Sample" to add a benchmark dataset without uploading.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {projDatasets.map((d) => (
                          <div
                            key={d.id}
                            style={{
                              background: 'var(--bg-subtle)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '0.65rem 0.85rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '0.5rem',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <FileSpreadsheet size={15} color="var(--text-secondary)" />
                              <span style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                {d.original_filename}
                              </span>
                              <span className="badge badge-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>
                                {d.file_type}
                              </span>
                              {d.row_count && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  ({d.row_count.toLocaleString()} rows)
                                </span>
                              )}
                              <span className={`badge ${d.days_remaining <= 1 ? 'badge-amber' : 'badge-muted'}`} style={{ fontSize: '0.65rem' }}>
                                <Clock size={10} /> {d.days_remaining > 0 ? `${d.days_remaining}d left` : `${d.hours_remaining}h left`}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <button
                                onClick={() => handleOpenDataset(d)}
                                className="btn btn-secondary btn-xs"
                              >
                                Studio
                              </button>
                              {d.has_cleaned && !d.is_expired && (
                                <a
                                  href={getDownloadUrl(d.project_id, d.id)}
                                  download
                                  className="btn btn-primary btn-xs"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                >
                                  <Download size={11} /> Cleaned
                                </a>
                              )}
                              <button
                                onClick={() => onRequestDeleteDataset(d)}
                                disabled={isDeletingAction && datasetToDelete?.id === d.id}
                                className="btn btn-ghost btn-xs"
                                style={{ color: 'var(--rose-primary)' }}
                                title="Delete dataset permanently"
                              >
                                {isDeletingAction && datasetToDelete?.id === d.id ? (
                                  <Loader2 size={12} className="spin" />
                                ) : (
                                  <Trash2 size={12} />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Add Sample Dataset Modal */}
      {sampleModalProject && (
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
          <div className="card" style={{ width: '100%', maxWidth: '520px', padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <Sparkles size={18} color="var(--amber-primary)" />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>
                Add Benchmark Dataset
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginBottom: '1.25rem' }}>
              Add a real-world dirty dataset into project <strong>"{sampleModalProject.name}"</strong> without uploading your own file.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {BENCHMARK_SAMPLES.map((s) => (
                <div
                  key={s.key}
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                      {s.desc}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--rose-primary)' }}>
                      Issues: {s.issues}
                    </div>
                  </div>

                  <button
                    onClick={() => handleAddSample(s.key)}
                    disabled={addingSampleKey !== null}
                    className="btn btn-primary btn-sm"
                    style={{ flexShrink: 0 }}
                  >
                    {addingSampleKey === s.key ? <Loader2 size={13} className="spin" /> : 'Add'}
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setSampleModalProject(null)}
                className="btn btn-secondary btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
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
          <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '1.75rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Create New Project
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
              Projects group datasets and cleaning workflows together.
            </p>

            <form onSubmit={handleCreateProject}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Telecom Customer Analytics"
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
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newProjectName.trim()}
                  className="btn btn-primary btn-sm"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Dataset Confirmation Modal Card (Theme aligned) */}
      <DeleteConfirmModal
        isOpen={!!datasetToDelete}
        onClose={() => {
          if (!isDeletingAction) {
            setDatasetToDelete(null)
            setDeleteModalError(null)
          }
        }}
        onConfirm={handleConfirmDeleteDataset}
        title="Permanently Delete Dataset"
        itemType="dataset"
        itemName={datasetToDelete?.original_filename}
        itemDetails={datasetToDelete ? {
          projectName: projects.find(p => p.id === datasetToDelete.project_id)?.name || 'Default Workspace',
          rows: datasetToDelete.row_count,
          cols: datasetToDelete.column_count,
          status: datasetToDelete.status,
          retentionText: datasetToDelete.days_remaining !== undefined
            ? (datasetToDelete.days_remaining > 0 ? `${datasetToDelete.days_remaining}d retention remaining` : `${datasetToDelete.hours_remaining}h retention remaining`)
            : null,
        } : null}
        warningMessage="This will permanently delete this dataset, including its original upload, cleaned states, profile metadata, and all version lineage snapshots from storage. This action cannot be reversed."
        isDeleting={isDeletingAction}
        error={deleteModalError}
      />

      {/* Delete Project Confirmation Modal Card (Theme aligned) */}
      <DeleteConfirmModal
        isOpen={!!projectToDelete}
        onClose={() => {
          if (!isDeletingAction) {
            setProjectToDelete(null)
            setDeleteModalError(null)
          }
        }}
        onConfirm={handleConfirmDeleteProject}
        title="Delete Project Workspace"
        itemType="project"
        itemName={projectToDelete?.name}
        warningMessage="This will permanently delete this project workspace and all uploaded datasets, versions, and cleaned files stored within it."
        isDeleting={isDeletingAction}
        error={deleteModalError}
      />
    </div>
  )
}
