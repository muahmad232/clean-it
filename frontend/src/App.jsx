import React, { useState } from 'react'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import AboutPage from './pages/AboutPage'
import InfoPage from './pages/InfoPage'
import { Sparkles, Heart, Terminal, Database, Cpu, ShieldCheck } from 'lucide-react'

export default function App() {
  const [activeTab, setActiveTab] = useState('studio')

  return (
    <div className="app-layout">
      {/* Navigation */}
      <Navbar activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Main View Area */}
      <main className="main-content">
        {activeTab === 'studio' && <HomePage onNavigate={setActiveTab} />}
        {activeTab === 'about' && <AboutPage onNavigate={setActiveTab} />}
        {activeTab === 'info' && <InfoPage onNavigate={setActiveTab} />}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(7, 9, 14, 0.95)',
        padding: '2.5rem 1.5rem',
        marginTop: 'auto',
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.5rem',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              <Sparkles size={16} color="var(--cyan-primary)" />
              Clean-It Engine
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Resource-efficient agentic data pipeline with deterministic Polars profiling & Groq AI reasoning.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge badge-muted">FastAPI</span>
            <span className="badge badge-muted">Polars</span>
            <span className="badge badge-muted">DuckDB</span>
            <span className="badge badge-muted">Supabase</span>
            <span className="badge badge-muted">Groq / Qwen 32B</span>
            <span className="badge badge-muted">React + Vite</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
