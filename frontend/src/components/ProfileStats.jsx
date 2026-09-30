import React from 'react'
import { Columns, HardDrive, AlertCircle, Layers } from 'lucide-react'

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
    <div style={{ marginBottom: '1.5rem' }}>
      <div className="grid-4">
        {/* Metric 1: Shape */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Shape</span>
            <Columns size={15} color="var(--text-muted)" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {rows.toLocaleString()} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>×</span> {cols}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Rows × Columns ({profile.file_type?.toUpperCase() || 'CSV'})
          </div>
        </div>

        {/* Metric 2: Estimated RAM */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>RAM Footprint</span>
            <HardDrive size={15} color="var(--text-muted)" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {memMb} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>MB</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--emerald-primary)', marginTop: '0.2rem' }}>
            Streaming scan (Render 512MB safe)
          </div>
        </div>

        {/* Metric 3: Null Values & Duplicates */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Nulls & Duplicates</span>
            <AlertCircle size={15} color={nullPct > 10 ? 'var(--amber-primary)' : 'var(--text-muted)'} />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {nullPct}% <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>missing</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {dupCount} exact duplicates ({dupPct}%)
          </div>
        </div>

        {/* Metric 4: Issues Detected */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quality Issues</span>
            <Layers size={15} color={issueCount > 0 ? 'var(--amber-primary)' : 'var(--emerald-primary)'} />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {issueCount} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>detected</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: criticalCount > 0 ? 'var(--rose-primary)' : highCount > 0 ? 'var(--amber-primary)' : 'var(--emerald-primary)', marginTop: '0.2rem' }}>
            {criticalCount > 0 ? `${criticalCount} Critical, ${highCount} High` : highCount > 0 ? `${highCount} High Priority` : 'All ground-truth checks pass'}
          </div>
        </div>
      </div>
    </div>
  )
}
