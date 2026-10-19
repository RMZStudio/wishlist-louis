import { useState } from 'react'
import { api, errorMessage } from '../api'
import { formatPrice } from '../lib'
import type { Item } from '../types'
import { CancelModal, ReserveModal } from './ReserveModals'

interface Props {
  item: Item
  admin: boolean
  editMode: boolean
  handle?: object
  onEdit?: () => void
  onDelete?: () => void
  onChanged: () => void | Promise<void>
}

export default function ItemCard({ item, admin, editMode, handle, onEdit, onDelete, onChanged }: Props) {
  const [current, setCurrent] = useState(0)
  const [modal, setModal] = useState<'reserve' | 'cancel' | null>(null)
  const r = item.reservation
  const cover = item.images[Math.min(current, item.images.length - 1)]

  async function adminCancel() {
    if (!confirm(`Annuler la réservation de ${r?.name} ?`)) return
    try {
      await api.del(`/api/admin/items/${item.id}/reservation`)
      await onChanged()
    } catch (e) {
      alert(errorMessage(e))
    }
  }

  return (
    <article className={'card' + (r ? ' is-reserved' : '')}>
      <div className="media">
        {cover ? <img src={`/img/${cover.file_key}`} alt={item.title} loading="lazy" /> : <div className="noimg">Pas encore de photo</div>}
        {r && <span className="ribbon">Réservé</span>}
        {item.images.length > 1 && (
          <div className="thumbs">
            {item.images.map((img, i) => (
              <button
                key={img.id}
                className={i === current ? 'on' : ''}
                onClick={() => setCurrent(i)}
                aria-label={`Photo ${i + 1}`}
              >
                <img src={`/img/${img.file_key}`} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card-body">
        <div className="card-title">
          <h3>{item.title}</h3>
          {item.price != null && <span className="price">{formatPrice(item.price)}</span>}
        </div>
        {item.description && <p className="desc">{item.description}</p>}

        {item.links.length > 0 && (
          <div className="chips">
            {item.links.map((l) => (
              <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="chip">
                {l.label}
              </a>
            ))}
          </div>
        )}

        {r && (
          <div className="resa">
            <p>
              <strong>Réservé par {r.name}</strong>
              {admin && r.email && <span className="muted"> ({r.email})</span>}
            </p>
            {r.message && (
              <blockquote>
                {r.message}
                {!r.message_public && <em> (message privé, visible par toi uniquement)</em>}
              </blockquote>
            )}
          </div>
        )}

        <div className="card-actions">
          {!r ? (
            <button className="btn primary" onClick={() => setModal('reserve')}>
              Je réserve ce cadeau
            </button>
          ) : (
            <button className="linklike" onClick={() => setModal('cancel')}>
              Annuler ma réservation
            </button>
          )}
          {admin && r && (
            <button className="linklike danger" onClick={() => void adminCancel()}>
              Annuler (admin)
            </button>
          )}
        </div>

        {editMode && (
          <div className="edit-bar">
            <button type="button" className="handle" aria-label="Déplacer" title="Glisser pour réordonner" {...handle}>
              ⋮⋮
            </button>
            <button className="btn small" onClick={onEdit}>
              Modifier
            </button>
            <button className="btn small danger" onClick={onDelete}>
              Supprimer
            </button>
          </div>
        )}
      </div>

      {modal === 'reserve' && <ReserveModal item={item} onClose={() => setModal(null)} onDone={onChanged} />}
      {modal === 'cancel' && <CancelModal item={item} onClose={() => setModal(null)} onDone={onChanged} />}
    </article>
  )
}
