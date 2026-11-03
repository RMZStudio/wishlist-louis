import { formatPrice } from '../lib'
import type { Item } from '../types'

// Ligne de l'affichage compact : petite photo, titre, prix, bouton vers le lien.
// Un clic sur la ligne ouvre la fiche complète.
export default function ItemRow({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const cover = item.images[0]
  const link = item.links[0]

  return (
    <div
      className={'row-item' + (item.reservation ? ' is-reserved' : '')}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="row-thumb">
        {cover ? <img src={`/img/${cover.file_key}`} alt="" loading="lazy" /> : <span>Pas de photo</span>}
      </div>
      <div className="row-main">
        <span className="row-title">
          {item.featured && (
            <span className="fav" title="Coup de cœur des parents" aria-label="Coup de cœur des parents">
              ♥
            </span>
          )}
          {item.title}
        </span>
        {item.reservation && <span className="row-tag">Réservé</span>}
      </div>
      {item.price != null && <span className="row-price">{formatPrice(item.price)}</span>}
      {link && (
        <a
          className="btn small"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          Voir
        </a>
      )}
    </div>
  )
}
