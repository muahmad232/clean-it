import React, { useEffect } from 'react'
import {
  X,
  Trash2,
  AlertTriangle,
  FileSpreadsheet,
  Folder,
  Loader2,
  Clock,
  Layers
} from 'lucide-react'

/**
 * DeleteConfirmModal
 * Displays a styled confirmation card matching the dark minimalist website theme
 * instead of native browser confirm() / alert() prompts.
 */
export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete Dataset',
  itemType = 'dataset', // 'dataset' | 'project'
  itemName = '',
  itemDetails = null,
  warningMessage = null,
  isDeleting = false,
  error = null,
}) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isDeleting, onClose])

  if (!isOpen) return null

  const isDataset = itemType === 'dataset'
  const defaultWarning = isDataset
    ? 'This will permanently remove the dataset file, all associated version snapshots (v0, v1, ...), and profiling metadata from Supabase Storage and the database. This action cannot be undone.'
    : 'This will permanently delete this project workspace and all uploaded datasets, versions, and cleaned files associated with it. This action cannot be undone.'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onClose()
        }
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          padding: '1.5rem',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Row with Icon & Close Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--rose-bg)',
                border: '1px solid var(--rose-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--rose-primary)',
                flexShrink: 0,
              }}
            >
              <Trash2 size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {title}
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                Please confirm deletion of this {itemType}.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isDeleting}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              padding: '0.35rem',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            title="Cancel and close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Selected Item Detail Card */}
        <div
          style={{
            background: 'var(--bg-main)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: itemDetails ? '0.5rem' : 0 }}>
            {isDataset ? (
              <FileSpreadsheet size={16} color="var(--text-secondary)" />
            ) : (
              <Folder size={16} color="var(--text-secondary)" />
            )}
            <span
              style={{
                fontSize: '0.88rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                wordBreak: 'break-all',
                fontFamily: isDataset ? 'var(--font-mono)' : 'var(--font-sans)',
              }}
            >
              {itemName || `Untitled ${itemType}`}
            </span>
          </div>

          {/* Optional Meta Tags Grid */}
          {itemDetails && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem 0.85rem',
                fontSize: '0.74rem',
                color: 'var(--text-secondary)',
                paddingTop: '0.35rem',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              {itemDetails.projectName && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Project: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{itemDetails.projectName}</span>
                </div>
              )}
              {itemDetails.rows !== undefined && itemDetails.rows !== null && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Rows: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{itemDetails.rows.toLocaleString()}</span>
                </div>
              )}
              {itemDetails.cols !== undefined && itemDetails.cols !== null && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Cols: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{itemDetails.cols}</span>
                </div>
              )}
              {itemDetails.status && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Status: </span>
                  <span className={`badge ${itemDetails.status === 'COMPLETED' ? 'badge-green' : 'badge-muted'}`} style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem' }}>
                    {itemDetails.status}
                  </span>
                </div>
              )}
              {itemDetails.retentionText && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Clock size={11} color="var(--text-muted)" />
                  <span style={{ color: 'var(--amber-primary)' }}>{itemDetails.retentionText}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Warning Callout Box */}
        <div
          style={{
            background: 'var(--rose-bg)',
            border: '1px solid var(--rose-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 0.9rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
          }}
        >
          <AlertTriangle size={16} color="var(--rose-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ fontSize: '0.78rem', color: '#fca5a5', lineHeight: 1.45, margin: 0 }}>
            {warningMessage || defaultWarning}
          </p>
        </div>

        {/* In-Card Error Display (replaces browser alert) */}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--rose-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.65rem 0.85rem',
              marginBottom: '1rem',
              fontSize: '0.78rem',
              color: '#fee2e2',
            }}
          >
            <strong>Error: </strong> {error}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.65rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="btn btn-secondary btn-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="btn btn-danger-solid btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            {isDeleting ? (
              <>
                <Loader2 size={13} className="spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 size={13} />
                <span>Delete Permanently</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
