import React, { useState, useEffect } from 'react'
import { Sparkles, ArrowRight, RefreshCw, CheckCircle2, ShieldCheck, Zap } from 'lucide-react'
import UploadZone from '../components/UploadZone'
import ProfileStats from '../components/ProfileStats'
import IssuesList from '../components/IssuesList'
import ColumnsExplorer from '../components/ColumnsExplorer'
import LlmSummaryCard from '../components/LlmSummaryCard'
import CleanActionCard from '../components/CleanActionCard'
import RecommendedDatasets from '../components/RecommendedDatasets'
import { getOrCreateDefaultProject, uploadDatasetFile, triggerDatasetProfile, fetchDatasetIssues } from '../api'

export default function HomePage({ onNavigate }) {
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

  const handleUploadAndProfile = async (file, taskType) => {
    setIsUploading(true)
    setError(null)
    setUploadProgress(`Connecting workspace...`)

    try {
      // 0. Ensure we have an active, verified project from the database
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
    <div>
      {/* Hero Section */}
      <div style={{ textAlign: 'center', margin: '1.5rem 0 3rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <span className="badge badge-cyan">
            <Zap size={12} /> Phase 1–5 Active: Ingestion & Deterministic Quality Engine
          </span>
        </div>

        <h1 style={{ fontSize: '2.8rem', fontWeight: 800, maxWidth: '850px', margin: '0 auto 1rem', lineHeight: 1.15 }}>
          Autonomous Self-Healing <br />
          <span style={{
            background: 'var(--grad-primary)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Data Cleaning Pipeline
          </span>
        </h1>

        <p style={{ color: 'var(--text-secondary)', fontSize: '1.15rem', maxWidth: '680px', margin: '0 auto 1.75rem', lineHeight: 1.6 }}>
          Inspect datasets, detect corruptions with deterministic Polars statistics, and prepare structured telemetry for agentic reasoning.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => onNavigate('about')}
            className="btn btn-secondary btn-sm"
          >
            Why Division of Labour?
          </button>
          <button
            onClick={() => onNavigate('info')}
            className="btn btn-ghost btn-sm"
          >
            System Specs & Architecture <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div style={{
          background: 'var(--rose-bg)',
          border: '1px solid var(--rose-border)',
          color: 'var(--rose-primary)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem 1.25rem',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <strong>Processing Error:</strong> {error}
          </div>
          <button onClick={() => setError(null)} className="btn btn-ghost btn-sm" style={{ color: 'var(--rose-primary)' }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Upload Zone */}
      <UploadZone
        onUploadComplete={handleUploadAndProfile}
        isUploading={isUploading || isCleaning}
        uploadProgress={uploadProgress}
      />

      {/* Results View */}
      {profileData && (
        <div style={{ marginBottom: '3rem' }}>
          {/* Header Action Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: 'var(--emerald-primary)',
                boxShadow: '0 0 10px var(--emerald-primary)',
              }} />
              <h2 style={{ fontSize: '1.4rem' }}>
                {activeDataset?.original_filename || 'Active Dataset'}
              </h2>
              <span className="badge badge-muted">
                {profileData.file_type?.toUpperCase()}
              </span>
            </div>

            <button
              onClick={handleReset}
              className="btn btn-secondary btn-sm"
            >
              <RefreshCw size={14} />
              Analyze Another Dataset
            </button>
          </div>

          {/* Task-Aware Cleaning & Download Action Card */}
          <CleanActionCard
            dataset={activeDataset}
            projectId={activeDataset?.project_id || project?.id}
            profile={profileData}
            isCleaning={isCleaning}
            setIsCleaning={setIsCleaning}
          />

          {/* Metric Stats Cards */}
          <ProfileStats profile={profileData} issues={issuesData} />

          {/* LLM Agent Context Summary */}
          <LlmSummaryCard summary={profileData.llm_summary} />

          {/* Detected Issues (Phase 5) */}
          <IssuesList issues={issuesData} />

          {/* Column Breakdown Table */}
          <ColumnsExplorer columns={profileData.columns || []} />
        </div>
      )}

      {/* Recommended Benchmark Dirty Datasets */}
      <RecommendedDatasets
        onSelectDataset={handleUploadAndProfile}
        isUploading={isUploading || isCleaning}
      />
    </div>
  )
}
