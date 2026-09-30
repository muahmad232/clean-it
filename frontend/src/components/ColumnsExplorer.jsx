import React, { useState } from 'react'
import { Table, Search, ArrowUpDown, Tag } from 'lucide-react'

export default function ColumnsExplorer({ columns = [] }) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredColumns = columns.filter(col =>
    col.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    col.dtype.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="glass-panel" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Table size={20} color="var(--cyan-primary)" />
            Column Schema & Statistical Distributions ({columns.length})
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.2rem' }}>
            Per-column types, null proportions, sample distinct values, and computed statistics.
          </p>
        </div>

        <div style={{ position: 'relative', minWidth: '240px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Filter columns or types..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.45rem 0.75rem 0.45rem 2.25rem',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Column Name</th>
              <th>Data Type</th>
              <th>Missing / Nulls</th>
              <th>Approx Uniques</th>
              <th>Sample Values</th>
              <th>Numeric Stats</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {filteredColumns.map((col, idx) => {
              const nullPct = col.null_pct || 0
              const stats = col.stats || {}
              const hasStats = Object.keys(stats).length > 0 && stats.min !== null

              return (
                <tr key={col.name || idx}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {col.name}
                  </td>

                  <td>
                    <span style={{
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '4px',
                      color: 'var(--violet-secondary)',
                    }}>
                      {col.dtype}
                    </span>
                  </td>

                  <td style={{ minWidth: '140px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{
                        flex: 1,
                        height: '6px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${Math.min(nullPct, 100)}%`,
                          height: '100%',
                          background: nullPct > 20 ? 'var(--rose-primary)' : nullPct > 5 ? 'var(--amber-primary)' : 'var(--cyan-primary)',
                        }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', minWidth: '45px', textAlign: 'right' }}>
                        {nullPct.toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {col.null_count?.toLocaleString()} rows
                    </div>
                  </td>

                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    {col.unique_count_approx?.toLocaleString() || 'N/A'}
                  </td>

                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', maxWidth: '280px' }}>
                      {(col.sample_values || []).slice(0, 3).map((val, vIdx) => (
                        <span
                          key={vIdx}
                          style={{
                            fontSize: '0.72rem',
                            fontFamily: 'var(--font-mono)',
                            background: 'rgba(0, 242, 254, 0.06)',
                            border: '1px solid rgba(0, 242, 254, 0.15)',
                            color: 'var(--text-secondary)',
                            padding: '0.15rem 0.35rem',
                            borderRadius: '3px',
                            maxWidth: '120px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {String(val)}
                        </span>
                      ))}
                    </div>
                  </td>

                  <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: '150px' }}>
                    {hasStats ? (
                      <div>
                        <div>min: <span style={{ color: 'var(--text-secondary)' }}>{stats.min}</span>, max: <span style={{ color: 'var(--text-secondary)' }}>{stats.max}</span></div>
                        <div>mean: <span style={{ color: 'var(--text-secondary)' }}>{stats.mean}</span>, std: <span style={{ color: 'var(--text-secondary)' }}>{stats.std}</span></div>
                      </div>
                    ) : (
                      <span>—</span>
                    )}
                  </td>

                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {(col.flags || []).map((flag, fIdx) => {
                        let colorClass = 'badge-muted'
                        if (flag === 'high_null') colorClass = 'badge-rose'
                        if (flag === 'likely_id') colorClass = 'badge-purple'
                        if (flag === 'constant') colorClass = 'badge-amber'
                        return (
                          <span key={fIdx} className={`badge ${colorClass}`} style={{ fontSize: '0.65rem' }}>
                            {flag}
                          </span>
                        )
                      })}
                      {(!col.flags || col.flags.length === 0) && (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>none</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
