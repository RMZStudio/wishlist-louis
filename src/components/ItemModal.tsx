import { useEffect, type ReactNode } from 'react'

// Fenêtre qui affiche la fiche complète d'un item (utilisée depuis l'affichage compact).
export default function ItemModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal fiche" role="dialog" aria-modal="true" aria-label={title}>
        <button className="icon-btn fiche-close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}
