import React, { useState, useEffect } from 'react'
import { Activity, Database, Cpu, Sparkles, BookOpen, Layers } from 'lucide-react'
import { fetchHealth } from '../api'

export default function Navbar({ activeTab, onSelectTab }) {
  const [health, setHealth] = useState({ status: 'checking', db_status: 'checking' })

  useEffect(() => {
    let mounted = true
    async function check() {
      const data = await fetchHealth()
      if (mounted) setHealth(data)
    }
    check()
    const timer = setInterval(check, 15000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  const isOnline = health.status === 'healthy'

  return (
    <header className="navbar">
      <div className="navbar-container">
        <a href="#studio" onClick={() => onSelectTab('studio')} className="brand">
          <div className="brand-icon">
            <Sparkles size={20} />
          </div>
          <div className="brand-text">
            <span>CLEAN-IT</span> // DATA PIPELINE
          </div>
        </a>

        <nav>
          <ul className="nav-links">
            <li>
              <button
                className={`nav-item ${activeTab === 'studio' ? 'active' : ''}`}
                onClick={() => onSelectTab('studio')}
              >
                <Activity size={16} />
                Studio
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'about' ? 'active' : ''}`}
                onClick={() => onSelectTab('about')}
              >
                <BookOpen size={16} />
                About
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'info' ? 'active' : ''}`}
                onClick={() => onSelectTab('info')}
              >
                <Layers size={16} />
                Architecture
              </button>
            </li>
          </ul>
        </nav>

        <div className="status-pill">
          <span className={`pulse-dot ${isOnline ? 'online' : 'error'}`} />
          <span style={{ fontWeight: 600 }}>
            {isOnline ? 'API Connected' : 'Offline'}
          </span>
          {isOnline && health.db_status && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Database size={11} /> {health.db_status}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
