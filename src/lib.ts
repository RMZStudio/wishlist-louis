// Change ici le nom affiché en haut du site.
export const SITE_NAME = 'Les envies de Louis'

// Thèmes facultatifs des listes.
export const THEMES = { noel: '🎄 Noël', anniversaire: '🎂 Anniversaire' } as const
export type ThemeKey = keyof typeof THEMES

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
export const formatPrice = (n: number) => euro.format(n)

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

// Réduit les photos (max 1600 px, WebP) avant l'envoi pour rester léger sur R2.
export async function resizeImage(file: File, max = 1600): Promise<File> {
  if (file.type === 'image/gif') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' })
  } catch {
    return file
  }
}
