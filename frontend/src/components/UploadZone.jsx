import React, { useState, useRef } from 'react'
import { Upload, FileText, AlertCircle, Loader2, Database } from 'lucide-react'

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
      setErrorMsg(`Unsupported file format. Please upload ${validExts.join(', ')}`)
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      setErrorMsg('File exceeds 50 MB limit.')
      return
    }

    onUploadComplete(file, taskType)
  }

  const handleLoadDemoDataset = () => {
    setErrorMsg(null)
    const rows = ['user_uuid,status,country,age,price_str,notes']

    for (let i = 0; i < 40; i++) {
      const uuid = `usr-${1000 + i}`
      const status = 'ACTIVE'
      const country = i === 38 || i === 39 ? 'CA' : 'US'
      const age = i % 4 === 0 ? '' : (22 + (i % 30)).toString()
      const price = (19.99 + (i * 2.5)).toFixed(2)
      const notes = ['Standard', 'Priority', 'Draft'][i % 3]
      rows.push(`${uuid},${status},${country},${age},"${price}",${notes}`)
    }

    for (let d = 0; d < 4; d++) {
      rows.push('usr-dup,ACTIVE,US,30,"49.99",Standard')
    }

    const csvContent = rows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const demoFile = new File([blob], 'synthetic_dirty_sample.csv', { type: 'text/csv' })

    onUploadComplete(demoFile, taskType)
  }

  return (
    <div className="card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Upload size={18} color="var(--text-secondary)" />
            Dataset Upload & Ingestion
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
            Upload CSV, JSON, or Parquet up to 50 MB. Polars executes lazy-frame scans directly.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            Intended Task:
          </label>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            disabled={isUploading}
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-medium)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.35rem 0.65rem',
              fontSize: '0.8rem',
              fontFamily: 'inherit',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="GENERAL">General Clean</option>
            <option value="CLASSIFICATION">Classification (Drop IDs)</option>
            <option value="REGRESSION">Regression (Median Impute)</option>
            <option value="CLUSTERING">Clustering</option>
            <option value="LLM_FINETUNING">LLM Fine-tuning</option>
          </select>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleLoadDemoDataset}
            disabled={isUploading}
          >
            <Database size={13} />
            Quick Dirty Sample
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{
          background: 'var(--rose-bg)',
          border: '1px solid var(--rose-border)',
          color: 'var(--rose-primary)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.65rem 0.85rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.825rem',
        }}>
          <AlertCircle size={15} />
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
          border: `1.5px dashed ${dragActive ? 'var(--text-primary)' : 'var(--border-medium)'}`,
          borderRadius: 'var(--radius-sm)',
          background: dragActive ? 'var(--bg-surface-elevated)' : 'var(--bg-subtle)',
          padding: '2.5rem 1.5rem',
          textAlign: 'center',
          cursor: isUploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <Loader2 size={24} className="spin" color="var(--text-primary)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {uploadProgress || 'Processing Dataset...'}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                Executing Polars streaming engine & rule detectors
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              marginBottom: '0.25rem',
            }}>
              <FileText size={20} />
            </div>

            <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              Drag and drop your dataset here, or <span style={{ textDecoration: 'underline' }}>browse file</span>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              CSV, JSON array, or Parquet up to 50 MB
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
