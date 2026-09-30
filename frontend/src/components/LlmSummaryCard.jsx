import React, { useState } from 'react'
import { Bot, Copy, Check, Sparkles, Terminal } from 'lucide-react'

export default function LlmSummaryCard({ summary = '' }) {
  const [copied, setCopied] = useState(false)

  if (!summary) return null

  // Rough estimation: 1 token ≈ 4 characters
  const estTokens = Math.round(summary.length / 4)

  const handleCopy = () => {
    navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="glass-panel" style={{ padding: '1.75rem', marginBottom: '2.5rem', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(168, 85, 247, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--violet-secondary)',
          }}>
            <Bot size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem' }}>
              Groq LLM Prompt Context Payload
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Deterministic plain-English summary prepared for agentic reasoning (Phase 7).
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="badge badge-purple" style={{ fontFamily: 'var(--font-mono)' }}>
            ~{estTokens} Tokens (Budget &lt; 500)
          </span>
          <button
            onClick={handleCopy}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.78rem' }}
          >
            {copied ? <Check size={14} color="var(--emerald-primary)" /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy Payload'}
          </button>
        </div>
      </div>

      <div style={{
        background: '#090d16',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.875rem',
        lineHeight: 1.7,
        color: '#e2e8f0',
        whiteSpace: 'pre-wrap',
      }}>
        {summary}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        <Sparkles size={12} color="var(--violet-secondary)" />
        <span>Strict Privacy Guard: Raw records never touch the Groq API. Only aggregate statistical fingerprints are transmitted.</span>
      </div>
    </div>
  )
}
