import React, { useState, useEffect } from 'react'
import { Database, BookOpen, Layers, Home, Sliders, User, LogOut, LogIn, FolderKanban } from 'lucide-react'
import { fetchHealth } from '../api'

export default function Navbar({
  activeTab,
  onSelectTab,
  user,
  onOpenAuth,
  onSignOut,
}) {
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
                className={`nav-item ${activeTab === 'projects' ? 'active' : ''}`}
                onClick={() => onSelectTab('projects')}
              >
                <FolderKanban size={15} />
                My Datasets
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

        {/* User / Auth Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="status-pill">
            <span className={`pulse-dot ${isOnline ? 'online' : 'error'}`} />
            <span>{isOnline ? 'API Ready' : 'Connecting'}</span>
          </div>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div
                onClick={() => onSelectTab('projects')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                  padding: '0.3rem 0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.78rem',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  maxWidth: '180px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={user.email}
              >
                <User size={13} color="var(--text-muted)" />
                <span>{user.email?.split('@')[0] || 'User'}</span>
              </div>
              <button
                onClick={onSignOut}
                className="btn btn-ghost btn-sm"
                title="Sign Out"
                style={{ padding: '0.35rem 0.5rem', color: 'var(--text-muted)' }}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <LogIn size={14} />
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
