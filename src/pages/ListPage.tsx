import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, errorMessage } from '../api'
import { useAuth } from '../auth'
import ItemCard from '../components/ItemCard'
import ItemEditor from '../components/ItemEditor'
import Modal from '../components/Modal'
import Sortable from '../components/Sortable'
import { THEMES, type ThemeKey } from '../lib'
import type { Category, Item, WishList } from '../types'

type Status = 'loading' | 'ok' | 'private' | 'missing' | 'error'

export default function ListPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const { ready, admin, editMode, setLoginOpen } = useAuth()
  const [data, setData] = useState<WishList | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newCat, setNewCat] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await api.get<WishList>(`/api/lists/${slug}`))
      setStatus('ok')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setStatus('private')
      else if (e instanceof ApiError && e.status === 404) setStatus('missing')
      else setStatus('error')
    }
  }, [slug])

  useEffect(() => {
    if (ready) void load()
  }, [ready, admin, load])

  const theme = data?.theme ?? null
  useEffect(() => {
    if (theme) document.body.dataset.theme = theme
    else delete document.body.dataset.theme
    return () => {
      delete document.body.dataset.theme
    }
  }, [theme])

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn()
      await load()
    } catch (e) {
      alert(errorMessage(e))
    }
  }

  if (!ready || status === 'loading') return <p className="muted">Chargement…</p>
  if (status === 'private') {
    return (
      <div className="notice">
        <h1>Cette liste est privée</h1>
        <p>Elle est encore en préparation. Seul l’admin peut la voir pour l’instant.</p>
        <button className="btn primary" onClick={() => setLoginOpen(true)}>
          Se connecter
        </button>
      </div>
    )
  }
  if (status === 'missing') {
    return (
      <div className="notice">
        <h1>Liste introuvable</h1>
        <p>Vérifie l’adresse, ou retourne à l’accueil pour voir les listes disponibles.</p>
      </div>
    )
  }
  if (status === 'error' || !data) return <p className="error">Impossible de charger la liste.</p>

  const list = data
  const editing = list.items.find((i) => i.id === editingId)
  const itemsOf = (categoryId: string | null) => list.items.filter((i) => i.category_id === categoryId)
  const reservedCount = list.items.filter((i) => i.reservation).length

  function reorderItems(subset: Item[]) {
    const ids = new Set(subset.map((i) => i.id))
    setData({ ...list, items: [...list.items.filter((i) => !ids.has(i.id)), ...subset] })
    api.post('/api/admin/reorder', { table: 'items', ids: subset.map((i) => i.id) }).catch(() => void load())
  }

  function reorderCategories(next: Category[]) {
    setData({ ...list, categories: next })
    api.post('/api/admin/reorder', { table: 'categories', ids: next.map((c) => c.id) }).catch(() => void load())
  }

  async function addItem(categoryId: string | null) {
    try {
      const r = await api.post<{ id: string }>(`/api/admin/lists/${list.id}/items`, {
        title: 'Nouvel item',
        category_id: categoryId,
      })
      await load()
      setEditingId(r.id)
    } catch (e) {
      alert(errorMessage(e))
    }
  }

  function removeItem(item: Item) {
    if (!confirm(`Supprimer « ${item.title} » ?`)) return
    void run(() => api.del(`/api/admin/items/${item.id}`))
  }

  function addCategory(e: FormEvent) {
    e.preventDefault()
    if (!newCat.trim()) return
    void run(async () => {
      await api.post(`/api/admin/lists/${list.id}/categories`, { title: newCat })
      setNewCat('')
    })
  }

  function renameCategory(cat: Category) {
    const title = prompt('Nouveau nom de la catégorie', cat.title)
    if (title && title.trim()) void run(() => api.patch(`/api/admin/categories/${cat.id}`, { title }))
  }

  function removeCategory(cat: Category) {
    if (!confirm(`Supprimer la catégorie « ${cat.title} » ? Ses items seront conservés, sans catégorie.`)) return
    void run(() => api.del(`/api/admin/categories/${cat.id}`))
  }

  const renderItems = (items: Item[], categoryId: string | null): ReactNode => (
    <>
      {editMode ? (
        <Sortable grid items={items} onReorder={reorderItems}>
          {(it, handle) => (
            <ItemCard
              item={it}
              admin={admin}
              editMode
              handle={handle}
              onEdit={() => setEditingId(it.id)}
              onDelete={() => removeItem(it)}
              onChanged={load}
            />
          )}
        </Sortable>
      ) : (
        <div className="grid">
          {items.map((it) => (
            <ItemCard key={it.id} item={it} admin={admin} editMode={false} onChanged={load} />
          ))}
        </div>
      )}
      {editMode && (
        <button className="btn ghost add" onClick={() => void addItem(categoryId)}>
          Ajouter un item
        </button>
      )}
    </>
  )

  const renderCategory = (cat: Category, handle?: object) => {
    const items = itemsOf(cat.id)
    if (!editMode && items.length === 0) return null
    return (
      <section key={cat.id} className="section">
        <div className="section-head">
          {editMode && (
            <button type="button" className="handle" aria-label="Déplacer la catégorie" {...handle}>
              ⋮⋮
            </button>
          )}
          <h2>{cat.title}</h2>
          {editMode && (
            <span className="section-tools">
              <button className="btn small ghost" onClick={() => renameCategory(cat)}>
                Renommer
              </button>
              <button className="btn small danger" onClick={() => removeCategory(cat)}>
                Supprimer
              </button>
            </span>
          )}
        </div>
        {renderItems(items, cat.id)}
      </section>
    )
  }

  const loose = itemsOf(null)
  const showLoose = editMode || loose.length > 0

  return (
    <>
      <section className="hero">
        {list.theme && <span className="badge theme-badge">{THEMES[list.theme]}</span>}
        <h1>{list.title}</h1>
        {list.description && <p>{list.description}</p>}
        <p className="muted">
          {list.items.length} idée{list.items.length > 1 ? 's' : ''}, {reservedCount} déjà réservée
          {reservedCount > 1 ? 's' : ''}
        </p>
      </section>

      {editMode && (
        <div className="editbanner">
          <p>
            {list.is_public
              ? 'Cette liste est publique : toute personne ayant le lien peut la voir.'
              : 'Cette liste est privée : tu es la seule personne à pouvoir la voir. Publie-la quand elle est prête.'}
          </p>
          <div className="row-actions">
            <button className="btn small" onClick={() => setSettingsOpen(true)}>
              Réglages de la liste
            </button>
            <button
              className="btn small ghost"
              onClick={() => void navigator.clipboard.writeText(`${location.origin}/${list.slug}`)}
            >
              Copier le lien
            </button>
          </div>
        </div>
      )}

      {list.items.length === 0 && list.categories.length === 0 && !editMode && (
        <p className="empty">Cette liste est vide pour l’instant.</p>
      )}

      {showLoose && (
        <section className="section">
          {editMode && (
            <div className="section-head">
              <h2>Sans catégorie</h2>
            </div>
          )}
          {renderItems(loose, null)}
        </section>
      )}

      {editMode ? (
        <Sortable items={list.categories} onReorder={reorderCategories}>
          {(cat, handle) => renderCategory(cat, handle)}
        </Sortable>
      ) : (
        list.categories.map((cat) => renderCategory(cat))
      )}

      {editMode && (
        <form onSubmit={addCategory} className="inline-form">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nouvelle catégorie (ex. Jouets d’éveil)" />
          <button className="btn primary">Créer la catégorie</button>
        </form>
      )}

      {editing && (
        <ItemEditor
          key={editing.id}
          item={editing}
          categories={list.categories}
          onClose={() => setEditingId(null)}
          onChanged={load}
        />
      )}

      {settingsOpen && (
        <ListSettings
          list={list}
          onClose={() => setSettingsOpen(false)}
          onSaved={async (newSlug) => {
            setSettingsOpen(false)
            if (newSlug !== slug) navigate(`/${newSlug}`, { replace: true })
            else await load()
          }}
          onDeleted={() => navigate('/', { replace: true })}
        />
      )}
    </>
  )
}

function ListSettings({
  list,
  onClose,
  onSaved,
  onDeleted,
}: {
  list: WishList
  onClose: () => void
  onSaved: (slug: string) => void | Promise<void>
  onDeleted: () => void
}) {
  const [title, setTitle] = useState(list.title)
  const [slug, setSlug] = useState(list.slug)
  const [description, setDescription] = useState(list.description)
  const [isPublic, setIsPublic] = useState(list.is_public)
  const [theme, setTheme] = useState<ThemeKey | ''>(list.theme ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api.patch<{ slug: string }>(`/api/admin/lists/${list.id}`, {
        title,
        slug,
        description,
        is_public: isPublic,
        theme: theme || null,
      })
      await onSaved(r.slug)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Supprimer la liste « ${list.title} » et tous ses items ? Cette action est définitive.`)) return
    try {
      await api.del(`/api/admin/lists/${list.id}`)
      onDeleted()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal title="Réglages de la liste" onClose={onClose}>
      <form onSubmit={save} className="stack">
        <label className="field">
          <span>Titre</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
        </label>
        <label className="field">
          <span>Adresse de la liste</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} required />
          <small>{location.origin}/{slug || '…'}</small>
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        <label className="field">
          <span>Thème (facultatif)</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeKey | '')}>
            <option value="">Aucun</option>
            {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
              <option key={k} value={k}>
                {THEMES[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          <span>Liste publique (sinon, seul l’admin connecté peut la voir)</span>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          Enregistrer
        </button>
        <button type="button" className="btn danger" onClick={() => void remove()}>
          Supprimer la liste
        </button>
      </form>
    </Modal>
  )
}
