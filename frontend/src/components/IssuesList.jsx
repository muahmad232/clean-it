import React, { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, CheckCircle2, ShieldAlert, Wrench } from 'lucide-react'

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
      case 'OUTLIER':
        return `Deterministic Tool: clip_outliers('${col}') or remove_outliers('${col}')`
      case 'INVALID_RANGE':
        return `Deterministic Tool: clip_range('${col}') or filter_invalid('${col}')`
      case 'DISTRIBUTION_SHIFT':
        return `Deterministic Tool: review_drift('${col}') or align_distributions()`
      case 'CLASS_IMBALANCE':
        return `Deterministic Tool: reweight_classes('${col}') or resample()`
      case 'TARGET_LEAKAGE':
        return `Deterministic Tool: drop_columns(['${col}']) [CRITICAL ML GUARD]`
      case 'DATE_PARSE_ERROR':
        return `Deterministic Tool: parse_dates('${col}') or standardize_date_formats()`
      default:
        return 'Deterministic pipeline transformation'
    }
  }

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={17} color="var(--amber-primary)" />
            Detected Data Quality Issues ({filteredIssues.length})
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginTop: '0.15rem' }}>
            Identified by deterministic rule engine with mathematical evidence.
          </p>
        </div>

        {/* Severity filter pills */}
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-subtle)', padding: '0.2rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          {severities.map(sev => {
            const count = sev === 'ALL' ? issues.length : issues.filter(i => i.severity === sev).length
            return (
              <button
                key={sev}
                onClick={() => setSelectedSeverity(sev)}
                style={{
                  background: selectedSeverity === sev ? 'var(--bg-surface-elevated)' : 'transparent',
                  color: selectedSeverity === sev ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: selectedSeverity === sev ? '1px solid var(--border-medium)' : '1px solid transparent',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.25rem 0.55rem',
                  fontSize: '0.72rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                {sev}
                <span style={{
                  fontSize: '0.68rem',
                  padding: '0.05rem 0.3rem',
                  borderRadius: '3px',
                  background: 'var(--bg-card)',
                  color: 'var(--text-muted)',
                }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {filteredIssues.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
          <CheckCircle2 size={32} color="var(--emerald-primary)" style={{ margin: '0 auto 0.5rem' }} />
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem' }}>
            No issues found under {selectedSeverity} severity
          </div>
          <p style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
            All tested constraints passed deterministic validation rules.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filteredIssues.map((issue, idx) => {
            const isExpanded = expandedId === (issue.id || idx)
            const sev = issue.severity || 'MEDIUM'

            return (
              <div
                key={issue.id || idx}
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => toggleExpand(issue.id || idx)}
                  style={{
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, flexWrap: 'wrap' }}>
                    <span className={`badge severity-${sev}`}>
                      {sev}
                    </span>

                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      padding: '0.15rem 0.45rem',
                      borderRadius: '3px',
                    }}>
                      {issue.issue_type}
                    </span>

                    {issue.column_name && (
                      <span style={{
                        color: 'var(--text-primary)',
                        fontSize: '0.825rem',
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                      }}>
                        [{issue.column_name}]
                      </span>
                    )}

                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', flex: 1 }}>
                      {issue.description}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(issue.confidence * 100).toFixed(0)}% conf
                    </span>
                    {isExpanded ? <ChevronDown size={15} color="var(--text-muted)" /> : <ChevronRight size={15} color="var(--text-muted)" />}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{
                    padding: '0.85rem 1rem',
                    background: 'var(--bg-surface)',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      <Wrench size={14} color="var(--text-muted)" />
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Recommended Tool:</span>
                      <code style={{ background: 'var(--bg-subtle)', padding: '0.15rem 0.45rem', borderRadius: '3px', border: '1px solid var(--border-subtle)' }}>
                        {getSuggestedAction(issue.issue_type, issue.column_name)}
                      </code>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Evidence (JSON)
                      </div>
                      <pre style={{
                        background: 'var(--bg-main)',
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        overflowX: 'auto',
                        border: '1px solid var(--border-subtle)',
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
