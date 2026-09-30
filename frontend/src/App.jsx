import React, { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import StudioPage from './pages/StudioPage'
import ProjectsPage from './pages/ProjectsPage'
import AboutPage from './pages/AboutPage'
import InfoPage from './pages/InfoPage'
import AuthModal from './components/AuthModal'
import {
  getOrCreateDefaultProject,
  fetchProjects,
  uploadDatasetFile,
  triggerDatasetProfile,
  fetchDatasetIssues
} from './api'
import { getSupabase, getCurrentSession, signOutUser } from './supabase'

export default function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [user, setUser] = useState(null)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [project, setProject] = useState(null)
  const [projects, setProjects] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [activeDataset, setActiveDataset] = useState(null)
  const [profileData, setProfileData] = useState(null)
  const [issuesData, setIssuesData] = useState([])
  const [error, setError] = useState(null)
  const [isCleaning, setIsCleaning] = useState(false)

  // 1. Check existing Auth session on startup
  useEffect(() => {
    async function initAuth() {
      try {
        const session = await getCurrentSession()
        if (session?.user) {
          setUser(session.user)
          localStorage.setItem('cleanit_user_id', session.user.id)
          localStorage.setItem('cleanit_access_token', session.access_token)
        }

        const supabase = await getSupabase()
        if (supabase) {
          supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
              setUser(session.user)
              localStorage.setItem('cleanit_user_id', session.user.id)
              localStorage.setItem('cleanit_access_token', session.access_token)
            } else {
              setUser(null)
              localStorage.removeItem('cleanit_user_id')
              localStorage.removeItem('cleanit_access_token')
            }
          })
        }
      } catch (err) {
        console.warn('Auth initialization warning:', err)
      }
    }
    initAuth()
  }, [])

  const refreshProjectsList = async () => {
    try {
      const list = await fetchProjects()
      setProjects(list)
      return list
    } catch {
      return []
    }
  }

  // 2. Initialize project container
  useEffect(() => {
    async function initProject() {
      const proj = await getOrCreateDefaultProject()
      setProject(proj)
      const list = await refreshProjectsList()
      if (proj && !list.some(p => p.id === proj.id)) {
        setProjects(prev => [proj, ...prev])
      }
    }
    initProject()
  }, [user])

  const handleUploadAndProfile = async (file, taskType = 'GENERAL', targetProjectId = null) => {
    setIsUploading(true)
    setError(null)
    setUploadProgress(`Connecting workspace...`)

    // Switch to studio view so user sees the progress and results immediately
    setActiveTab('studio')

    try {
      let currentProject = null
      if (targetProjectId) {
        currentProject = projects.find(p => p.id === targetProjectId) || { id: targetProjectId }
      } else {
        currentProject = project
      }

      if (!currentProject || !currentProject.id || currentProject.id === '00000000-0000-0000-0000-000000000001') {
        currentProject = await getOrCreateDefaultProject()
        setProject(currentProject)
      }

      setUploadProgress(`Uploading ${file.name}...`)

      // 1. Upload to FastAPI -> Supabase Storage
      const uploadResult = await uploadDatasetFile(currentProject.id, file, taskType)
      const dataset = uploadResult.dataset
      setActiveDataset(dataset)

      const effectiveProjectId = dataset.project_id || currentProject.id

      // 2. Trigger Polars Deterministic Profiling
      setUploadProgress('Running Polars streaming profiler...')
      const profileResult = await triggerDatasetProfile(effectiveProjectId, dataset.id)
      setProfileData(profileResult.profile)

      // 3. Fetch structured issues from Phase 5 detector
      setUploadProgress('Evaluating deterministic data quality rules...')
      const issuesResult = await fetchDatasetIssues(effectiveProjectId, dataset.id)
      setIssuesData(issuesResult.issues || [])

      setUploadProgress('')
      refreshProjectsList()
    } catch (err) {
      console.error(err)
      setError(err.message || 'An error occurred during dataset processing.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleOpenExistingDataset = async (dataset) => {
    setActiveDataset(dataset)
    setProfileData(dataset.profile_json || null)
    if (dataset.project_id) {
      const proj = projects.find(p => p.id === dataset.project_id)
      if (proj) setProject(proj)
    }
    setActiveTab('studio')

    // Fetch fresh issues if available
    try {
      const issuesResult = await fetchDatasetIssues(dataset.project_id, dataset.id)
      setIssuesData(issuesResult.issues || [])
    } catch {
      setIssuesData([])
    }
  }

  const handleReset = () => {
    setActiveDataset(null)
    setProfileData(null)
    setIssuesData([])
    setError(null)
  }

  const handleDatasetCleaned = (cleanedResult) => {
    if (cleanedResult?.final_profile) {
      setProfileData(cleanedResult.final_profile)
      setIssuesData(cleanedResult.final_profile.issues || [])
    }
  }

  const handleSignOut = async () => {
    await signOutUser()
    setUser(null)
    handleReset()
  }

  return (
    <div className="app-layout">
      {/* Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Main View Area */}
      <main className="main-content">
        {activeTab === 'home' && (
          <HomePage
            onNavigate={setActiveTab}
            onStartWithFile={handleUploadAndProfile}
          />
        )}

        {activeTab === 'studio' && (
          <StudioPage
            project={project}
            projects={projects}
            onSelectProject={setProject}
            onRefreshProjects={refreshProjectsList}
            activeDataset={activeDataset}
            profileData={profileData}
            issuesData={issuesData}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            error={error}
            isCleaning={isCleaning}
            setIsCleaning={setIsCleaning}
            onUploadAndProfile={handleUploadAndProfile}
            onReset={handleReset}
            onErrorDismiss={() => setError(null)}
            onDatasetCleaned={handleDatasetCleaned}
          />
        )}

        {activeTab === 'projects' && (
          <ProjectsPage
            user={user}
            onOpenAuth={() => setIsAuthOpen(true)}
            onOpenDatasetInStudio={handleOpenExistingDataset}
            onNavigate={setActiveTab}
            onSelectProjectForUpload={(proj) => {
              setProject(proj)
              setActiveTab('studio')
            }}
            onRefreshProjects={refreshProjectsList}
          />
        )}

        {activeTab === 'about' && <AboutPage onNavigate={setActiveTab} />}
        {activeTab === 'info' && <InfoPage onNavigate={setActiveTab} />}
      </main>

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(u) => {
          setUser(u)
          setIsAuthOpen(false)
        }}
      />

      {/* Clean, Simple Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        padding: '1.5rem',
        marginTop: 'auto',
      }}>
        <div style={{
          maxWidth: '1300px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          fontSize: '0.8rem',
        }}>
          <div>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Clean-It</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
              Deterministic tabular data preparation & quality engine &bull; 10-day retention
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <span className="badge badge-muted">FastAPI</span>
            <span className="badge badge-muted">Polars</span>
            <span className="badge badge-muted">Supabase Auth</span>
            <span className="badge badge-muted">Google OAuth</span>
            <span className="badge badge-muted">React + Vite</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
