import React, { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import StudioPage from './pages/StudioPage'
import AboutPage from './pages/AboutPage'
import InfoPage from './pages/InfoPage'
import {
  getOrCreateDefaultProject,
  uploadDatasetFile,
  triggerDatasetProfile,
  fetchDatasetIssues
} from './api'

export default function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [project, setProject] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [activeDataset, setActiveDataset] = useState(null)
  const [profileData, setProfileData] = useState(null)
  const [issuesData, setIssuesData] = useState([])
  const [error, setError] = useState(null)
  const [isCleaning, setIsCleaning] = useState(false)

  useEffect(() => {
    async function initProject() {
      const proj = await getOrCreateDefaultProject()
      setProject(proj)
    }
    initProject()
  }, [])

  const handleUploadAndProfile = async (file, taskType = 'GENERAL') => {
    setIsUploading(true)
    setError(null)
    setUploadProgress(`Connecting workspace...`)

    // Switch to studio view so user sees the progress and results immediately
    setActiveTab('studio')

    try {
      let currentProject = project
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
    } catch (err) {
      console.error(err)
      setError(err.message || 'An error occurred during dataset processing.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleReset = () => {
    setActiveDataset(null)
    setProfileData(null)
    setIssuesData([])
    setError(null)
  }

  return (
    <div className="app-layout">
      {/* Navigation */}
      <Navbar activeTab={activeTab} onSelectTab={setActiveTab} />

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
          />
        )}

        {activeTab === 'about' && <AboutPage onNavigate={setActiveTab} />}
        {activeTab === 'info' && <InfoPage onNavigate={setActiveTab} />}
      </main>

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
              Deterministic tabular data preparation & quality engine
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <span className="badge badge-muted">FastAPI</span>
            <span className="badge badge-muted">Polars</span>
            <span className="badge badge-muted">DuckDB</span>
            <span className="badge badge-muted">Supabase</span>
            <span className="badge badge-muted">React + Vite</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
