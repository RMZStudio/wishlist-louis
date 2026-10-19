import { useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api'
import type { Item } from '../types'
import Modal from './Modal'

const VISITOR_KEY = 'wishlist_visitor'

function savedVisitor(): { name: string; email: string } {
  try {
    return { name: '', email: '', ...JSON.parse(localStorage.getItem(VISITOR_KEY) ?? '{}') }
  } catch {
    return { name: '', email: '' }
  }
}

interface Props {
  item: Item
  onClose: () => void
  onDone: () => void | Promise<void>
}

export function ReserveModal({ item, onClose, onDone }: Props) {
  const initial = savedVisitor()
  const [name, setName] = useState(initial.name)
  const [email, setEmail] = useState(initial.email)
  const [message, setMessage] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post(`/api/items/${item.id}/reserve`, { name, email, message, messagePublic: isPublic })
      try {
        localStorage.setItem(VISITOR_KEY, JSON.stringify({ name, email }))
      } catch {
        // stockage indisponible : sans importance
      }
      await onDone()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={`Réserver « ${item.title} »`} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Ton nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus />
        </label>
        <label className="field">
          <span>Ton adresse e-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <small>Elle n’est pas affichée.</small>
        </label>
        <label className="field">
          <span>Message (facultatif)</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3} />
        </label>
        <fieldset className="radios">
          <legend>Qui peut lire ce message ?</legend>
          <label>
            <input type="radio" checked={isPublic} onChange={() => setIsPublic(true)} /> Tout le monde
          </label>
          <label>
            <input type="radio" checked={!isPublic} onChange={() => setIsPublic(false)} /> Privé : seuls les parents
            le voient
          </label>
        </fieldset>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          Confirmer la réservation
        </button>
      </form>
    </Modal>
  )
}

export function CancelModal({ item, onClose, onDone }: Props) {
  const [email, setEmail] = useState(savedVisitor().email)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post(`/api/items/${item.id}/cancel`, { email })
      await onDone()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="Annuler la réservation" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Adresse e-mail utilisée pour réserver</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          Annuler ma réservation
        </button>
      </form>
    </Modal>
  )
}
