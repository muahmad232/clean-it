import React, { useState, useRef } from 'react'
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Loader2, Sparkles, Database } from 'lucide-react'

export default function UploadZone({ onUploadComplete, isUploading, uploadProgress }) {
  const [dragActive, setDragActive] = useState(false)
  const [taskType, setTaskType] = useState('GENERAL')
  const [errorMsg, setErrorMsg] = useState(null)
  const fileInputRef = useRef(null)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0])
    }
  }

  const handleFileSelected = (file) => {
    setErrorMsg(null)
    const validExts = ['.csv', '.json', '.parquet']
    const hasValidExt = validExts.some(ext => file.name.toLowerCase().endsWith(ext))
    if (!hasValidExt) {
      setErrorMsg(`Unsupported file type. Allowed formats: ${validExts.join(', ')}`)
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      setErrorMsg('File exceeds maximum upload size of 50 MB.')
      return
    }

    onUploadComplete(file, taskType)
  }

  // Generates a dirty test CSV demonstrating all 7 Phase 5 detectors
  const handleLoadDemoDataset = () => {
    setErrorMsg(null)
    const rows = [
      'user_uuid,status,country,age,price_str,notes',
    ]

    for (let i = 0; i < 40; i++) {
      const uuid = `usr-${1000 + i}`                             // POSSIBLE_IDENTIFIER (100% unique string)
      const status = 'ACTIVE'                                      // CONSTANT_COLUMN (single value)
      const country = i === 38 || i === 39 ? 'CA' : 'US'         // NEAR_CONSTANT_COLUMN (38/40 = 95% US)
      const age = i % 4 === 0 ? '' : (22 + (i % 30)).toString()    // MISSING_VALUES (25% nulls)
      const price = (19.99 + (i * 2.5)).toFixed(2)                 // TYPE_MISMATCH (numeric stored as string)
      const notes = ['Standard', 'Priority', 'Draft'][i % 3]

      rows.push(`${uuid},${status},${country},${age},"${price}",${notes}`)
    }

    // Add 4 exact duplicate rows to trigger DUPLICATES detector
    for (let d = 0; d < 4; d++) {
      rows.push('usr-dup,ACTIVE,US,30,"49.99",Standard')
    }

    const csvContent = rows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const demoFile = new File([blob], 'demo_dirty_dataset.csv', { type: 'text/csv' })

    onUploadComplete(demoFile, taskType)
  }

  return (
    <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <UploadCloud color="var(--cyan-primary)" size={24} />
            Dataset Ingestion & Quality Analysis
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Upload raw CSV, JSON, or Parquet datasets (up to 50 MB) for deterministic profiling.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Task Type:
          </label>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            disabled={isUploading}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-medium)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.4rem 0.75rem',
              fontSize: '0.85rem',
              fontFamily: 'inherit',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="GENERAL" style={{ background: '#0d131f' }}>General Clean</option>
            <option value="CLASSIFICATION" style={{ background: '#0d131f' }}>Classification</option>
            <option value="REGRESSION" style={{ background: '#0d131f' }}>Regression</option>
            <option value="CLUSTERING" style={{ background: '#0d131f' }}>Clustering</option>
            <option value="LLM_FINETUNING" style={{ background: '#0d131f' }}>LLM Fine-tuning</option>
          </select>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleLoadDemoDataset}
            disabled={isUploading}
            style={{ borderColor: 'rgba(168, 85, 247, 0.4)', background: 'rgba(168, 85, 247, 0.08)' }}
          >
            <Sparkles size={14} color="var(--violet-secondary)" />
            Load Sample Dirty CSV
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{
          background: 'var(--rose-bg)',
          border: '1px solid var(--rose-border)',
          color: 'var(--rose-primary)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.875rem',
        }}>
          <AlertTriangle size={18} />
          {errorMsg}
        </div>
      )}

      {/* Drag & Drop Area */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragActive ? 'var(--cyan-primary)' : 'rgba(255, 255, 255, 0.15)'}`,
          borderRadius: 'var(--radius-md)',
          background: dragActive ? 'rgba(0, 242, 254, 0.05)' : 'rgba(255, 255, 255, 0.02)',
          padding: '3rem 1.5rem',
          textAlign: 'center',
          cursor: isUploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: dragActive ? '0 0 25px rgba(0, 242, 254, 0.15)' : 'none',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,.parquet"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          disabled={isUploading}
        />

        {isUploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <Loader2 size={36} color="var(--cyan-primary)" className="spin" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--cyan-primary)' }}>
                {uploadProgress || 'Processing Dataset...'}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Executing Polars streaming engine & deterministic detectors
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: 'rgba(0, 242, 254, 0.1)',
              border: '1px solid rgba(0, 242, 254, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan-primary)',
            }}>
              <FileText size={28} />
            </div>

            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Drag & Drop your dataset here, or <span style={{ color: 'var(--cyan-primary)', textDecoration: 'underline' }}>browse</span>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '400px' }}>
              Supports CSV, JSON array, and Parquet. Automatically converts and extracts column shapes, null heatmaps, and duplicate metrics.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <span className="badge badge-muted">Max 50 MB</span>
              <span className="badge badge-muted">Polars Lazy Scan</span>
              <span className="badge badge-muted">Deterministic Checks</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
