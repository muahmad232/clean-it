import React, { useState, useEffect } from 'react'
import { Activity, Database, BookOpen, Layers, Home, Sliders } from 'lucide-react'
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
        <a href="#home" onClick={(e) => { e.preventDefault(); onSelectTab('home') }} className="brand">
          <div className="brand-icon">
            <Sliders size={16} />
          </div>
          <div className="brand-text">
            Clean-It
            <span className="brand-tag">/ Data Studio</span>
          </div>
        </a>

        <nav>
          <ul className="nav-links">
            <li>
              <button
                className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
                onClick={() => onSelectTab('home')}
              >
                <Home size={15} />
                Home
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'studio' ? 'active' : ''}`}
                onClick={() => onSelectTab('studio')}
              >
                <Sliders size={15} />
                Data Studio
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'about' ? 'active' : ''}`}
                onClick={() => onSelectTab('about')}
              >
                <BookOpen size={15} />
                Methodology
              </button>
            </li>
            <li>
              <button
                className={`nav-item ${activeTab === 'info' ? 'active' : ''}`}
                onClick={() => onSelectTab('info')}
              >
                <Layers size={15} />
                Specs
              </button>
            </li>
          </ul>
        </nav>

        <div className="status-pill">
          <span className={`pulse-dot ${isOnline ? 'online' : 'error'}`} />
          <span>{isOnline ? 'FastAPI Online' : 'Connecting'}</span>
          {isOnline && health.db_status === 'ok' && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
              &bull; DB Connected
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
