import React, { useState } from 'react'
import { Terminal, Copy, Check, ShieldCheck } from 'lucide-react'

export default function LlmSummaryCard({ summary = '' }) {
  const [copied, setCopied] = useState(false)

  if (!summary) return null

  const estTokens = Math.round(summary.length / 4)

  const handleCopy = () => {
    navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Terminal size={16} color="var(--text-secondary)" />
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              Statistical Fingerprint Payload
            </h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
              Structured plain-English summary prepared for downstream reasoning.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="badge badge-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
            ~{estTokens} tokens
          </span>
          <button
            onClick={handleCopy}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
          >
            {copied ? <Check size={13} color="var(--emerald-primary)" /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div style={{
        background: 'var(--bg-main)',
        borderRadius: 'var(--radius-sm)',
        padding: '1rem',
        border: '1px solid var(--border-subtle)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8rem',
        lineHeight: 1.6,
        color: 'var(--text-secondary)',
        whiteSpace: 'pre-wrap',
      }}>
        {summary}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.65rem', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
        <ShieldCheck size={13} color="var(--emerald-primary)" />
        <span>Privacy Guard: Only aggregate statistical counts are captured; zero raw rows transmitted.</span>
      </div>
    </div>
  )
}
