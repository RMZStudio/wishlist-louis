import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { SITE_NAME } from './lib'
import LoginModal from './components/LoginModal'
import Home from './pages/Home'
import ListPage from './pages/ListPage'
import Logs from './pages/Logs'

export default function App() {
  const { admin, editMode, setEditMode, logout, loginOpen, setLoginOpen } = useAuth()

  return (
    <div className={'app' + (admin && editMode ? ' is-editing' : '')}>
      <header className="topbar">
        <Link to="/" className="brand">
          {SITE_NAME}
        </Link>
        {admin && (
          <nav className="admin-nav" aria-label="Administration">
            <NavLink to="/admin/logs">Journal</NavLink>
            <label className="switch">
              <input type="checkbox" checked={editMode} onChange={(e) => setEditMode(e.target.checked)} />
              <span>Mode édition</span>
            </label>
            <button className="btn small ghost" onClick={() => void logout()}>
              Déconnexion
            </button>
          </nav>
        )}
      </header>

      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/logs" element={<Logs />} />
          <Route path="/:slug" element={<ListPage />} />
        </Routes>
      </main>

      <footer className="foot">
        {!admin && (
          <button className="linklike" onClick={() => setLoginOpen(true)}>
            Espace admin
          </button>
        )}
      </footer>

      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </div>
  )
}
