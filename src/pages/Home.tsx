import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../api'
import { useAuth } from '../auth'
import Sortable from '../components/Sortable'
import { THEMES } from '../lib'
import type { ListSummary } from '../types'

function Counts({ l }: { l: ListSummary }) {
  if (l.item_count === 0) return <span className="muted">Liste vide pour l’instant</span>
  return (
    <span className="muted">
      {l.item_count} idée{l.item_count > 1 ? 's' : ''}, {l.reserved_count} réservée{l.reserved_count > 1 ? 's' : ''}
    </span>
  )
}

export default function Home() {
  const { ready, admin, editMode } = useAuth()
  const [lists, setLists] = useState<ListSummary[] | null>(null)
  const [title, setTitle] = useState('')

  const load = useCallback(
    () =>
      api
        .get<ListSummary[]>('/api/lists')
        .then(setLists)
        .catch(() => setLists([])),
    [],
  )
  useEffect(() => {
    if (ready) void load()
  }, [ready, admin, load])

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await api.post('/api/admin/lists', { title })
      setTitle('')
      await load()
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  function reorder(next: ListSummary[]) {
    setLists(next)
    api.post('/api/admin/reorder', { table: 'lists', ids: next.map((l) => l.id) }).catch(() => void load())
  }

  async function togglePublic(l: ListSummary) {
    await api.patch(`/api/admin/lists/${l.id}`, { is_public: !l.is_public })
    await load()
  }

  async function remove(l: ListSummary) {
    if (!confirm(`Supprimer la liste « ${l.title} » et tous ses items ? Cette action est définitive.`)) return
    await api.del(`/api/admin/lists/${l.id}`)
    await load()
  }

  return (
    <>
      <section className="hero">
        <h1>Nos listes de souhaits</h1>
        <p>Choisis une liste, repère une idée et réserve-la pour que personne ne l’offre en double.</p>
      </section>

      {lists === null && <p className="muted">Chargement…</p>}
      {lists && lists.length === 0 && (
        <p className="empty">{admin ? 'Crée ta première liste ci-dessous.' : 'Aucune liste publique pour le moment.'}</p>
      )}

      {lists && !editMode && (
        <div className="list-grid">
          {lists.map((l) => (
            <Link key={l.id} to={`/${l.slug}`} className={'list-card' + (l.theme ? ` theme-${l.theme}` : '')}>
              <h2>{l.title}</h2>
              {l.description && <p>{l.description}</p>}
              <Counts l={l} />
              <span className="badges">
                {l.theme && <span className="badge theme-badge">{THEMES[l.theme]}</span>}
                {!l.is_public && <span className="badge">Privée</span>}
              </span>
            </Link>
          ))}
        </div>
      )}

      {lists && editMode && (
        <Sortable items={lists} onReorder={reorder}>
          {(l, handle) => (
            <div className="list-row">
              <button type="button" className="handle" aria-label="Déplacer" {...handle}>
                ⋮⋮
              </button>
              <Link to={`/${l.slug}`} className="list-row-main">
                <strong>{l.title}</strong>
                <Counts l={l} />
              </Link>
              <button className={'btn small ' + (l.is_public ? 'ok' : 'ghost')} onClick={() => void togglePublic(l)}>
                {l.is_public ? 'Publique' : 'Privée'}
              </button>
              <button className="btn small danger" onClick={() => void remove(l)}>
                Supprimer
              </button>
            </div>
          )}
        </Sortable>
      )}

      {editMode && (
        <form onSubmit={create} className="inline-form">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nom de la nouvelle liste (ex. Noël 2026)" />
          <button className="btn primary">Créer la liste</button>
        </form>
      )}
    </>
  )
}
