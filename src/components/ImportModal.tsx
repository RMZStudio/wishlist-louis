import { useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api'
import Modal from './Modal'

interface Props {
  listId: string
  categoryId: string | null
  onClose: () => void
  onDone: (itemId: string) => void | Promise<void>
}

export default function ImportModal({ listId, categoryId, onClose, onDone }: Props) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState('')

  async function run(linkOnly: boolean) {
    setBusy(true)
    setError('')
    try {
      const r = await api.post<{ id: string }>(`/api/admin/lists/${listId}/import`, {
        url,
        category_id: categoryId,
        linkOnly,
      })
      await onDone(r.id)
    } catch (err) {
      setError(errorMessage(err))
      setFailed(true)
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void run(false)
  }

  return (
    <Modal title="Ajouter depuis un lien" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Adresse de la page du produit</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required autoFocus />
          <small>
            Le titre, la description, le prix et les photos sont récupérés quand le site le permet. Tu pourras tout
            corriger ensuite.
          </small>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Récupération en cours…' : 'Importer'}
        </button>
        {failed && !busy && (
          <button type="button" className="btn ghost" onClick={() => void run(true)} disabled={!url.trim()}>
            Créer l’item avec le lien seulement
          </button>
        )}
      </form>
    </Modal>
  )
}
