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
  Plus
} from 'lucide-react'
import {
  fetchProjects,
  createProject,
  deleteProject,
  fetchUserDatasets,
  deleteDataset,
  getDownloadUrl,
  triggerDatasetProfile,
  fetchDatasetIssues
} from '../api'

export default function ProjectsPage({
  user,
  onOpenAuth,
  onOpenDatasetInStudio,
  onNavigate
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
    try {
      await createProject(newProjectName.trim(), 'Interactive cleaning workspace')
      setNewProjectName('')
      setShowCreateModal(false)
      await loadData()
    } catch (err) {
      setError(err.message || 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteDataset = async (dataset) => {
    if (!window.confirm(`Are you sure you want to delete dataset "${dataset.original_filename}"? This will permanently remove its files from storage.`)) {
      return
    }
    setDeletingId(dataset.id)
    try {
      await deleteDataset(dataset.project_id, dataset.id)
      setDatasets(prev => prev.filter(d => d.id !== dataset.id))
    } catch (err) {
      alert(`Could not delete dataset: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteProject = async (proj) => {
    if (!window.confirm(`Delete project "${proj.name}"? This will permanently delete ALL datasets within it.`)) {
      return
    }
    setDeletingId(proj.id)
    try {
      await deleteProject(proj.id)
      setProjects(prev => prev.filter(p => p.id !== proj.id))
      // Also remove datasets that belonged to this project
      setDatasets(prev => prev.filter(d => d.project_id !== proj.id))
    } catch (err) {
      alert(`Could not delete project: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const handleOpenDataset = async (d) => {
    if (onOpenDatasetInStudio) {
      onOpenDatasetInStudio(d)
    } else {
      onNavigate('studio')
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
            Sign in to access your linked projects, inspect past dataset profiles, and download previous cleaned exports (retained for 10 days).
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

  return (
    <div style={{ maxWidth: '1150px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.75rem',
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
            Datasets are retained for 10 days. Cleaned CSVs can be accessed or deleted at any time.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-secondary btn-sm"
          >
            <FolderPlus size={14} />
            New Project
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="btn btn-ghost btn-sm"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

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
          <strong>10-Day Retention Policy:</strong> To conserve cloud storage, all uploaded and cleaned datasets remain available for download for exactly 10 days from upload, after which they are automatically purged.
        </span>
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <button
          onClick={() => setActiveTab('datasets')}
          className={`btn btn-sm ${activeTab === 'datasets' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Datasets ({datasets.length})
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`btn btn-sm ${activeTab === 'projects' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Projects ({projects.length})
        </button>
      </div>

      {/* Loading State */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <Loader2 size={24} className="spin" style={{ margin: '0 auto 0.5rem' }} />
          <div>Loading your datasets and workspaces...</div>
        </div>
      ) : activeTab === 'datasets' ? (
        /* Datasets List */
        datasets.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
            <FileSpreadsheet size={36} color="var(--text-dim)" style={{ margin: '0 auto 0.75rem' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              No datasets uploaded yet
            </h3>
            <p style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Upload your first dataset in the Data Studio to profile and clean it.
            </p>
            <button onClick={() => onNavigate('studio')} className="btn btn-primary btn-sm">
              Open Data Studio <ArrowRight size={14} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {datasets.map((d) => {
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
                      <span>Project: <strong style={{ color: 'var(--text-primary)' }}>{d.project_name}</strong></span>
                      {d.row_count && (
                        <span>{d.row_count.toLocaleString()} rows × {d.column_count} cols</span>
                      )}
                      <span>Uploaded {new Date(d.created_at).toLocaleDateString()}</span>
                    </div>

                    {/* Retention Countdown Pill */}
                    <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {d.is_expired ? (
                        <span className="badge badge-rose">
                          <Clock size={11} /> Expired (Purged)
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
                      title="Open in Data Studio"
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
                      onClick={() => handleDeleteDataset(d)}
                      disabled={isDeleting}
                      className="btn btn-ghost btn-sm"
                      title="Delete dataset permanently"
                      style={{ color: 'var(--rose-primary)' }}
                    >
                      {isDeleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        /* Projects List */
        projects.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
            <FolderPlus size={36} color="var(--text-dim)" style={{ margin: '0 auto 0.75rem' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              No projects created yet
            </h3>
            <p style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Create a project container to group your related datasets together.
            </p>
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
              <Plus size={14} /> Create Project
            </button>
          </div>
        ) : (
          <div className="grid-2">
            {projects.map((p) => {
              const isDeleting = deletingId === p.id
              const projDatasets = datasets.filter(d => d.project_id === p.id)

              return (
                <div
                  key={p.id}
                  className="card"
                  style={{
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {p.name}
                      </h3>
                      <span className="badge badge-muted">
                        {projDatasets.length} dataset{projDatasets.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginBottom: '0.75rem' }}>
                      {p.description || 'Workspace container'}
                    </p>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Created {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem', marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleDeleteProject(p)}
                      disabled={isDeleting}
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--rose-primary)' }}
                    >
                      {isDeleting ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                      Delete Project
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
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
          <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '1.75rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Create New Project
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '1rem' }}>
              Projects group datasets and cleaning configurations together.
            </p>

            <form onSubmit={handleCreateProject}>
              <input
                type="text"
                required
                placeholder="Project Name (e.g. Churn Analysis)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                  outline: 'none',
                }}
              />

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
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
