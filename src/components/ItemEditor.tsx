import { useState, type ChangeEvent, type FormEvent } from 'react'
import { api, errorMessage } from '../api'
import { resizeImage } from '../lib'
import type { Category, Item } from '../types'
import Modal from './Modal'

interface Props {
  item: Item
  categories: Category[]
  onClose: () => void
  onChanged: () => void | Promise<void>
}

export default function ItemEditor({ item, categories, onClose, onChanged }: Props) {
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description)
  const [price, setPrice] = useState(item.price == null ? '' : String(item.price).replace('.', ','))
  const [categoryId, setCategoryId] = useState(item.category_id ?? '')
  const [links, setLinks] = useState(item.links.map((l) => ({ label: l.label, url: l.url })))
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState('')

  async function addFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setUploading(true)
    setError('')
    try {
      for (const f of files) await api.upload(item.id, await resizeImage(f))
      await onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
    setUploading(false)
  }

  async function addUrl() {
    const url = imageUrl.trim()
    if (!url) return
    setUploading(true)
    setError('')
    try {
      await api.post(`/api/admin/items/${item.id}/images/from-url`, { url })
      setImageUrl('')
      await onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
    setUploading(false)
  }

  async function removeImage(id: string) {
    try {
      await api.del(`/api/admin/images/${id}`)
      await onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function makeFirst(id: string) {
    const ids = [id, ...item.images.map((i) => i.id).filter((x) => x !== id)]
    try {
      await api.post('/api/admin/reorder', { table: 'images', ids })
      await onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const trimmed = price.trim()
    const parsed = trimmed === '' ? null : Number(trimmed.replace(',', '.'))
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setError('Le prix doit être un nombre.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.patch(`/api/admin/items/${item.id}`, {
        title,
        description,
        price: parsed,
        category_id: categoryId || null,
        links: links.filter((l) => l.url.trim()),
      })
      await onChanged()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="Modifier l’item" onClose={onClose} wide>
      <form onSubmit={save} className="stack">
        <label className="field">
          <span>Titre</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </label>

        <label className="field">
          <span>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
        </label>

        <div className="row2">
          <label className="field">
            <span>Prix (€)</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="29,90" />
          </label>
          <label className="field">
            <span>Catégorie</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sans catégorie</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          <span>Photos</span>
          <div className="img-grid">
            {item.images.map((img, i) => (
              <div key={img.id} className="img-tile">
                <img src={`/img/${img.file_key}`} alt="" />
                <div>
                  {i > 0 && (
                    <button type="button" className="linklike" onClick={() => void makeFirst(img.id)}>
                      Principale
                    </button>
                  )}
                  <button type="button" className="linklike danger" onClick={() => void removeImage(img.id)}>
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
          <input type="file" accept="image/*" multiple onChange={(e) => void addFiles(e)} disabled={uploading} />
          <div className="url-row">
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void addUrl()
                }
              }}
              placeholder="…ou colle l’adresse d’une image (https://…)"
              disabled={uploading}
            />
            <button type="button" className="btn small" onClick={() => void addUrl()} disabled={uploading || !imageUrl.trim()}>
              Ajouter
            </button>
          </div>
          {uploading && <small>Envoi en cours…</small>}
        </div>

        <div className="field">
          <span>Liens</span>
          {links.map((l, i) => (
            <div key={i} className="link-row">
              <input
                placeholder="Nom (ex. Amazon)"
                value={l.label}
                onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <input
                placeholder="https://…"
                value={l.url}
                onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
              />
              <button type="button" className="icon-btn" aria-label="Retirer le lien" onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn small ghost" onClick={() => setLinks([...links, { label: '', url: '' }])}>
            Ajouter un lien
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy || uploading}>
          Enregistrer
        </button>
      </form>
    </Modal>
  )
}
