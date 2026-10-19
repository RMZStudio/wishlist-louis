import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { formatDate } from '../lib'
import type { LogEntry } from '../types'

const LABELS: Record<LogEntry['action'], string> = {
  reserve: 'Réservation',
  cancel: 'Annulation',
  admin_cancel: 'Annulation (admin)',
}

export default function Logs() {
  const { ready, admin, setLoginOpen } = useAuth()
  const [logs, setLogs] = useState<LogEntry[] | null>(null)

  useEffect(() => {
    if (ready && admin) api.get<LogEntry[]>('/api/admin/logs').then(setLogs).catch(() => setLogs([]))
  }, [ready, admin])

  if (!ready) return null
  if (!admin) {
    return (
      <div className="notice">
        <h1>Journal réservé à l’admin</h1>
        <button className="btn primary" onClick={() => setLoginOpen(true)}>
          Se connecter
        </button>
      </div>
    )
  }

  return (
    <>
      <section className="hero">
        <h1>Journal des actions</h1>
        <p>Toutes les réservations et annulations, y compris les messages privés.</p>
      </section>
      {logs === null && <p className="muted">Chargement…</p>}
      {logs && logs.length === 0 && <p className="empty">Aucune action pour l’instant.</p>}
      {logs && logs.length > 0 && (
        <div className="table-wrap">
          <table className="logs">
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Liste / item</th>
                <th>Qui</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{formatDate(l.at)}</td>
                  <td>
                    <span className={'tag ' + l.action}>{LABELS[l.action]}</span>
                  </td>
                  <td>
                    {l.item_title}
                    <br />
                    <span className="muted">{l.list_title}</span>
                  </td>
                  <td>
                    {l.name}
                    <br />
                    <span className="muted">{l.email}</span>
                  </td>
                  <td>
                    {l.message ?? <span className="muted">—</span>}
                    {l.message && <span className="muted"> ({l.message_public ? 'public' : 'privé'})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
