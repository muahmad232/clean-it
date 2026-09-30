/**
 * Backend API Client
 * Seamlessly interfaces with the FastAPI backend (local or production).
 */

const API_BASE = ''  // Handled by Vite proxy in development or direct host in prod

export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    return { status: 'offline', error: err.message }
  }
}

export async function fetchLimits() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/limits`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    // Default fallback matching backend config
    return {
      max_upload_size_mb: 50,
      max_rows: 1000000,
      max_columns: 150,
      allowed_extensions: ['.csv', '.json', '.parquet'],
    }
  }
}

/**
 * Creates or retrieves a default working project for dataset uploads.
 */
export async function getOrCreateDefaultProject() {
  // If already stored in localStorage, use it
  const cachedId = localStorage.getItem('cleanit_project_id')
  if (cachedId) {
    return { id: cachedId, name: 'Default Data Studio' }
  }

  // Generate a client session UUID for anonymous workspace
  const newId = '00000000-0000-0000-0000-000000000001'
  localStorage.setItem('cleanit_project_id', newId)
  return { id: newId, name: 'Default Data Studio' }
}

/**
 * Uploads a file using multipart form-data.
 */
export async function uploadDatasetFile(projectId, file, taskType = 'GENERAL') {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(
    `${API_BASE}/api/v1/projects/${projectId}/datasets/upload?task_type=${taskType}`,
    {
      method: 'POST',
      body: formData,
    }
  )

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.detail?.message || errBody.detail?.error || `Upload failed with status ${res.status}`)
  }

  return await res.json()
}

/**
 * Triggers Polars deterministic profiling and issue detection.
 */
export async function triggerDatasetProfile(projectId, datasetId) {
  const res = await fetch(
    `${API_BASE}/api/v1/projects/${projectId}/datasets/${datasetId}/profile`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
  )

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.detail?.message || `Profiling failed with status ${res.status}`)
  }

  return await res.json()
}

/**
 * Retrieves detected data quality issues with optional filters.
 */
export async function fetchDatasetIssues(projectId, datasetId, { severity, issueType } = {}) {
  const params = new URLSearchParams()
  if (severity && severity !== 'ALL') params.append('severity', severity)
  if (issueType && issueType !== 'ALL') params.append('issue_type', issueType)

  const url = `${API_BASE}/api/v1/projects/${projectId}/datasets/${datasetId}/issues?${params.toString()}`
  const res = await fetch(url)

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.detail?.message || `Failed to fetch issues`)
  }

  return await res.json()
}
