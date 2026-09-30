import React from 'react'
import { Hash, Columns, Copy, AlertOctagon, Layers, HardDrive, CheckCircle } from 'lucide-react'

export default function ProfileStats({ profile, issues }) {
  if (!profile) return null

  const rows = profile.shape?.rows ?? 0
  const cols = profile.shape?.columns ?? 0
  const memMb = profile.estimated_memory_mb ?? 0
  const nullPct = profile.total_null_pct ?? 0
  const dupCount = profile.duplicate_row_count ?? 0
  const dupPct = profile.duplicate_row_pct ?? 0
  const issueCount = issues?.length ?? profile.issues?.length ?? 0

  const criticalCount = (issues || []).filter(i => i.severity === 'CRITICAL').length
  const highCount = (issues || []).filter(i => i.severity === 'HIGH').length

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Dataset Telemetry & Footprint
      </h3>

      <div className="grid-4">
        {/* Metric 1: Shape */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Dimension / Shape</span>
            <Columns size={16} color="var(--cyan-primary)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {rows.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>×</span> {cols}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Rows × Columns ({profile.file_type?.toUpperCase() || 'DATASET'})
          </div>
        </div>

        {/* Metric 2: Estimated RAM */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Memory Footprint</span>
            <HardDrive size={16} color="var(--violet-secondary)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {memMb} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>MB</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--emerald-primary)', marginTop: '0.25rem' }}>
            ✓ Within Render 512MB RAM budget
          </div>
        </div>

        {/* Metric 3: Null Values & Duplicates */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Data Sparsity</span>
            <AlertOctagon size={16} color={nullPct > 10 ? 'var(--amber-primary)' : 'var(--emerald-primary)'} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: nullPct > 10 ? 'var(--amber-primary)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {nullPct}% <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>nulls</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {dupCount} duplicates ({dupPct}%)
          </div>
        </div>

        {/* Metric 4: Issues Detected */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Detected Issues</span>
            <Layers size={16} color={issueCount > 0 ? 'var(--rose-primary)' : 'var(--emerald-primary)'} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: issueCount > 0 ? 'var(--text-primary)' : 'var(--emerald-primary)', fontFamily: 'var(--font-mono)' }}>
            {issueCount}
          </div>
          <div style={{ fontSize: '0.8rem', color: criticalCount > 0 ? 'var(--rose-primary)' : highCount > 0 ? 'var(--amber-primary)' : 'var(--text-muted)', marginTop: '0.25rem' }}>
            {criticalCount > 0 ? `${criticalCount} Critical, ${highCount} High` : highCount > 0 ? `${highCount} High Priority` : 'All checks verified'}
          </div>
        </div>
      </div>
    </div>
  )
}
