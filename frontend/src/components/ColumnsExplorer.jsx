import React, { useState } from 'react'
import { Table, Search } from 'lucide-react'

export default function ColumnsExplorer({ columns = [] }) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredColumns = columns.filter(col =>
    col.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    col.dtype.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Table size={17} color="var(--text-secondary)" />
            Column Schema & Distribution ({columns.length})
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginTop: '0.15rem' }}>
            Column data types, null rates, cardinality, and sample records.
          </p>
        </div>

        <div style={{ position: 'relative', minWidth: '220px' }}>
          <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search columns or types..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.35rem 0.65rem 0.35rem 2rem',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
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
              <th>Nulls</th>
              <th>Unique Approx</th>
              <th>Sample Values</th>
              <th>Numeric Range</th>
              <th>Status</th>
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
                      fontSize: '0.72rem',
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-subtle)',
                      padding: '0.15rem 0.35rem',
                      borderRadius: '3px',
                      color: 'var(--text-secondary)',
                    }}>
                      {col.dtype}
                    </span>
                  </td>

                  <td style={{ minWidth: '130px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{
                        flex: 1,
                        height: '4px',
                        background: 'var(--border-subtle)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${Math.min(nullPct, 100)}%`,
                          height: '100%',
                          background: nullPct > 20 ? 'var(--rose-primary)' : nullPct > 5 ? 'var(--amber-primary)' : 'var(--emerald-primary)',
                        }} />
                      </div>
                      <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', minWidth: '40px', textAlign: 'right' }}>
                        {nullPct.toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {col.null_count?.toLocaleString()} rows
                    </div>
                  </td>

                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {col.unique_count_approx?.toLocaleString() || 'N/A'}
                  </td>

                  <td>
                    <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', maxWidth: '240px' }}>
                      {(col.sample_values || []).slice(0, 3).map((val, vIdx) => (
                        <span
                          key={vIdx}
                          style={{
                            fontSize: '0.7rem',
                            fontFamily: 'var(--font-mono)',
                            background: 'var(--bg-subtle)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                            padding: '0.1rem 0.3rem',
                            borderRadius: '3px',
                            maxWidth: '100px',
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

                  <td style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: '140px' }}>
                    {hasStats ? (
                      <div>
                        [{stats.min ?? '?'}, {stats.max ?? '?'}] &bull; μ={typeof stats.mean === 'number' ? stats.mean.toFixed(1) : '?'}
                      </div>
                    ) : (
                      'Non-numeric'
                    )}
                  </td>

                  <td>
                    {nullPct > 50 ? (
                      <span className="badge badge-rose">High Null</span>
                    ) : nullPct > 0 ? (
                      <span className="badge badge-amber">{col.null_count} nulls</span>
                    ) : (
                      <span className="badge badge-emerald">Complete</span>
                    )}
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
