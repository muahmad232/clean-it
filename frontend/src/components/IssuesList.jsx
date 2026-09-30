import React, { useState } from 'react'
import { AlertCircle, Filter, ChevronDown, ChevronRight, CheckCircle2, ShieldAlert, Wrench } from 'lucide-react'

export default function IssuesList({ issues = [] }) {
  const [selectedSeverity, setSelectedSeverity] = useState('ALL')
  const [expandedId, setExpandedId] = useState(null)

  const severities = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

  const filteredIssues = issues.filter(issue => {
    if (selectedSeverity === 'ALL') return true
    return issue.severity === selectedSeverity
  })

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id)
  }

  // Helpful tool recommendation for future Phase 9 Tool Executor
  const getSuggestedAction = (type, col) => {
    switch (type) {
      case 'DUPLICATES':
        return 'Deterministic Tool: remove_duplicates()'
      case 'MISSING_VALUES':
        return `Deterministic Tool: impute_median('${col}') or drop_high_null()`
      case 'CONSTANT_COLUMN':
        return `Deterministic Tool: drop_constant_column('${col}')`
      case 'NEAR_CONSTANT_COLUMN':
        return `Deterministic Tool: review_near_constant('${col}')`
      case 'POSSIBLE_IDENTIFIER':
        return `Deterministic Tool: drop_identifier('${col}') to prevent target leakage`
      case 'HIGH_CARDINALITY':
        return `Deterministic Tool: target_encode('${col}') or top_k_group()`
      case 'TYPE_MISMATCH':
        return `Deterministic Tool: cast_type('${col}')`
      default:
        return 'Autonomous pipeline inspection'
    }
  }

  return (
    <div className="glass-panel" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={20} color="var(--rose-primary)" />
            Detected Data Quality Issues ({filteredIssues.length})
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.2rem' }}>
            Identified by Phase 5 deterministic rule engine with mathematical evidence.
          </p>
        </div>

        {/* Severity filter pills */}
        <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(255, 255, 255, 0.03)', padding: '0.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          {severities.map(sev => {
            const count = sev === 'ALL' ? issues.length : issues.filter(i => i.severity === sev).length
            return (
              <button
                key={sev}
                onClick={() => setSelectedSeverity(sev)}
                style={{
                  background: selectedSeverity === sev ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                  color: selectedSeverity === sev ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                {sev}
                <span style={{
                  fontSize: '0.7rem',
                  padding: '0.1rem 0.35rem',
                  borderRadius: '9999px',
                  background: selectedSeverity === sev ? 'rgba(0, 242, 254, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: selectedSeverity === sev ? 'var(--cyan-primary)' : 'var(--text-muted)',
                }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {filteredIssues.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
          <CheckCircle2 size={40} color="var(--emerald-primary)" style={{ margin: '0 auto 0.75rem' }} />
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1.05rem' }}>
            No issues found under {selectedSeverity} severity
          </div>
          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            All checked constraints passed without triggering deterministic violation rules.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredIssues.map((issue, idx) => {
            const isExpanded = expandedId === (issue.id || idx)
            const sev = issue.severity || 'MEDIUM'

            return (
              <div
                key={issue.id || idx}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                }}
              >
                <div
                  onClick={() => toggleExpand(issue.id || idx)}
                  style={{
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1 }}>
                    <span className={`badge severity-${sev}`}>
                      {sev}
                    </span>

                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem',
                      color: 'var(--cyan-primary)',
                      background: 'rgba(0, 242, 254, 0.08)',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                    }}>
                      {issue.issue_type}
                    </span>

                    {issue.column_name && (
                      <span style={{
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                      }}>
                        [{issue.column_name}]
                      </span>
                    )}

                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', flex: 1 }}>
                      {issue.description}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(issue.confidence * 100).toFixed(0)}% confidence
                    </span>
                    {isExpanded ? <ChevronDown size={18} color="var(--text-muted)" /> : <ChevronRight size={18} color="var(--text-muted)" />}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{
                    padding: '1rem 1.25rem',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--violet-secondary)', fontSize: '0.85rem' }}>
                      <Wrench size={15} />
                      <span style={{ fontWeight: 600 }}>Suggested Pipeline Action:</span>
                      <code style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                        {getSuggestedAction(issue.issue_type, issue.column_name)}
                      </code>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Deterministic Mathematical Evidence (JSON)
                      </div>
                      <pre style={{
                        background: '#080c14',
                        padding: '0.75rem 1rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8rem',
                        color: 'var(--cyan-secondary)',
                        overflowX: 'auto',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                      }}>
                        {JSON.stringify(issue.evidence_json || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
