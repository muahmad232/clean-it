/**
 * Backend API Client
 * Interfaces with the FastAPI backend and coordinates with Supabase Auth.
 */

const API_BASE = ''  // Handled by Vite proxy in development or direct host in prod

export function getAuthHeaders() {
  const headers = {}
  const userId = localStorage.getItem('cleanit_user_id')
  if (userId) {
    headers['X-User-Id'] = userId
  }
  const token = localStorage.getItem('cleanit_access_token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

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
    return {
      max_upload_size_mb: 50,
      max_rows: 1000000,
      max_columns: 150,
      allowed_extensions: ['.csv', '.json', '.parquet'],
    }
  }
}

/**
 * Creates or retrieves a valid project from the backend for dataset uploads.
 */
export async function getOrCreateDefaultProject() {
  const userId = localStorage.getItem('cleanit_user_id')
  const cacheKey = userId ? `cleanit_project_id_${userId}` : 'cleanit_project_id_guest'
  const cachedId = localStorage.getItem(cacheKey) || localStorage.getItem('cleanit_project_id')
  const authHeaders = getAuthHeaders()

  // 1. Verify if cached project actually exists in database AND belongs to this user
  if (cachedId && cachedId !== '00000000-0000-0000-0000-000000000001') {
    try {
      const checkRes = await fetch(`${API_BASE}/api/v1/projects/${cachedId}`, {
        headers: authHeaders,
      })
      if (checkRes.ok) {
        const data = await checkRes.json()
        if (data.project) {
          const projUserId = String(data.project.user_id || '')
          if (!userId || projUserId === userId) {
            localStorage.setItem(cacheKey, data.project.id)
            return data.project
          }
          // If project was default anon and user is now authenticated, claim it
          if (userId && projUserId === '00000000-0000-0000-0000-000000000001') {
            await claimProject(data.project.id).catch(() => null)
            data.project.user_id = userId
            localStorage.setItem(cacheKey, data.project.id)
            return data.project
          }
        }
      }
    } catch {
      // Fall through to list/create
    }
  }

  // 2. Fetch existing projects for user
  try {
    const listRes = await fetch(`${API_BASE}/api/v1/projects`, {
      headers: authHeaders,
    })
    if (listRes.ok) {
      const listData = await listRes.json()
      if (listData.projects && listData.projects.length > 0) {
        const existing = listData.projects[0]
        localStorage.setItem(cacheKey, existing.id)
        return existing
      }
    }

    // 3. None exist yet — create a new project record in Supabase
    const createRes = await fetch(`${API_BASE}/api/v1/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        name: 'Default Data Studio',
        description: 'Interactive data cleaning workspace',
      }),
    })

    if (createRes.ok) {
      const createData = await createRes.json()
      if (createData.project) {
        localStorage.setItem(cacheKey, createData.project.id)
        return createData.project
      }
    }
  } catch (err) {
    console.error('Error establishing project container:', err)
  }

  // Fallback
  return { id: cachedId, name: 'Default Data Studio' }
}

/**
 * Claims ownership of a project for the authenticated user.
 */
export async function claimProject(projectId) {
  const res = await fetch(`${API_BASE}/api/v1/projects/${projectId}/claim`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to claim project')
  return await res.json()
}

/**
 * Adds a benchmark dataset into a specific project without manual file upload.
 */
export async function addSampleDataset(projectId, sampleKey = 'telco_churn', taskType = null) {
  const res = await fetch(`${API_BASE}/api/v1/projects/${projectId}/datasets/sample`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ sample_key: sampleKey, task_type: taskType }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.detail?.message || 'Failed to add sample dataset')
  }
  return await res.json()
}

/**
 * Lists all projects for the user.
 */
export async function fetchProjects() {
  const res = await fetch(`${API_BASE}/api/v1/projects`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to fetch projects')
  const data = await res.json()
  return data.projects || []
}

/**
 * Creates a new project container.
 */
export async function createProject(name, description = '') {
  const res = await fetch(`${API_BASE}/api/v1/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ name, description }),
  })
  if (!res.ok) throw new Error('Failed to create project')
  return await res.json()
}

/**
 * Deletes a project and all its child datasets and files.
 */
export async function deleteProject(projectId) {
  const res = await fetch(`${API_BASE}/api/v1/projects/${projectId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete project')
  return await res.json()
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
      headers: getAuthHeaders(),
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
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
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
  const res = await fetch(url, {
    headers: getAuthHeaders(),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.detail?.message || `Failed to fetch issues`)
  }

  return await res.json()
}

/**
 * Triggers task-aware dataset cleaning.
 */
export async function cleanDataset(projectId, datasetId, taskType = 'GENERAL', targetColumn = null) {
  const params = new URLSearchParams()
  if (taskType) params.append('task_type', taskType)
  if (targetColumn) params.append('target_column', targetColumn)

  const url = `${API_BASE}/api/v1/projects/${projectId}/datasets/${datasetId}/clean?${params.toString()}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.detail?.message || `Cleaning failed with status ${res.status}`)
  }

  return await res.json()
}

/**
 * Lists all datasets across all projects belonging to the user with 10-day retention countdown.
 */
export async function fetchUserDatasets() {
  const res = await fetch(`${API_BASE}/api/v1/user/datasets`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to fetch user datasets')
  const data = await res.json()
  return data.datasets || []
}

/**
 * Deletes a dataset and removes its files from Supabase Storage.
 */
export async function deleteDataset(projectId, datasetId) {
  const url = projectId
    ? `${API_BASE}/api/v1/projects/${projectId}/datasets/${datasetId}`
    : `${API_BASE}/api/v1/datasets/${datasetId}`

  const res = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete dataset')
  return await res.json()
}

/**
 * Returns direct download URL for dataset.
 */
export function getDownloadUrl(projectId, datasetId) {
  return `${API_BASE}/api/v1/projects/${projectId}/datasets/${datasetId}/download`
}

/**
 * Triggers 10-day retention cleanup of expired datasets.
 */
export async function triggerRetentionCleanup() {
  const res = await fetch(`${API_BASE}/api/v1/maintenance/cleanup-expired`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Cleanup trigger failed')
  return await res.json()
}

/**
 * Checks LLM engine provider and token telemetry.
 */
export async function fetchLlmHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/llm/health`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    return {
      provider: 'GroqProvider',
      model: 'qwen/qwen3.8-27b',
      api_key_configured: false,
      token_stats: { total_calls: 0, prompt_tokens: 0, completion_tokens: 0 },
    }
  }
}

/**
 * Generates AI diagnostics, defect impact reasoning, and cleaning strategies via Groq LLM.
 */
export async function analyzeDatasetWithLlm({
  datasetName = 'Dataset',
  taskType = 'GENERAL',
  rowCount = 0,
  columnCount = 0,
  duplicateRows = 0,
  llmSummary = '',
  issues = [],
}) {
  const res = await fetch(`${API_BASE}/api/v1/llm/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      dataset_name: datasetName,
      task_type: taskType,
      row_count: rowCount,
      column_count: columnCount,
      duplicate_rows: duplicateRows,
      llm_summary: llmSummary,
      issues: issues,
    }),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.detail?.message || errBody.detail?.error || `AI Analysis failed (HTTP ${res.status})`)
  }

  return await res.json()
}

/**
 * Triggers the autonomous multi-step agentic cleaning loop:
 * LLM diagnoses -> Selects functions -> Polars cleans -> Re-profiles -> Iterates until clean.
 */
export async function runAgenticCleaning(projectId, datasetId, taskType = 'GENERAL', targetColumn = null, maxIterations = 3) {
  const params = new URLSearchParams()
  if (taskType) params.append('task_type', taskType)
  if (targetColumn) params.append('target_column', targetColumn)
  if (maxIterations) params.append('max_iterations', maxIterations)

  const url = projectId
    ? `${API_BASE}/api/v1/projects/${projectId}/datasets/${datasetId}/agent-clean?${params.toString()}`
    : `${API_BASE}/api/v1/datasets/${datasetId}/agent-clean?${params.toString()}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.detail?.message || errBody.detail?.error || `Agentic cleaning failed (HTTP ${res.status})`)
  }

  return await res.json()
}

/**
 * Phase 11: Dataset Versioning & Rollback
 */

export async function fetchDatasetVersions(projectId, datasetId) {
  const url = projectId
    ? `${API_BASE}/api/v1/projects/${projectId}/datasets/${datasetId}/versions`
    : `${API_BASE}/api/v1/datasets/${datasetId}/versions`

  const res = await fetch(url, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.detail?.message || errBody.detail?.error || `Failed to fetch versions (HTTP ${res.status})`)
  }
  return await res.json()
}

export async function rollbackDatasetVersion(projectId, datasetId, targetVersionId = null, reason = 'User requested rollback') {
  const url = projectId
    ? `${API_BASE}/api/v1/projects/${projectId}/datasets/${datasetId}/rollback`
    : `${API_BASE}/api/v1/datasets/${datasetId}/rollback`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      target_version_id: targetVersionId,
      reason: reason,
    }),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.detail?.message || errBody.detail?.error || `Rollback rejected (HTTP ${res.status})`)
  }
  return await res.json()
}

export function getVersionDownloadUrl(projectId, datasetId, versionNumber, format = 'csv') {
  if (projectId) {
    return `${API_BASE}/api/v1/projects/${projectId}/datasets/${datasetId}/versions/${versionNumber}/download?format=${format}`
  }
  return `${API_BASE}/api/v1/datasets/${datasetId}/versions/${versionNumber}/download?format=${format}`
}



