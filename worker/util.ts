export const uid = () => crypto.randomUUID()

export const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

const RESERVED_SLUGS = ['admin', 'api', 'img', 'assets', 'login', 'logout']

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export async function uniqueSlug(db: D1Database, base: string, ignoreId?: string) {
  let slug = slugify(base) || 'liste'
  if (RESERVED_SLUGS.includes(slug)) slug += '-liste'
  let candidate = slug
  let n = 1
  for (;;) {
    const row = await db
      .prepare('SELECT id FROM lists WHERE slug = ?')
      .bind(candidate)
      .first<{ id: string }>()
    if (!row || row.id === ignoreId) return candidate
    n += 1
    candidate = `${slug}-${n}`
  }
}

// Comparaison de mots de passe à temps constant (via hash SHA-256).
export async function safeEqual(a: string, b: string) {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  return crypto.subtle.timingSafeEqual(ha, hb)
}

export type LogAction = 'reserve' | 'cancel' | 'admin_cancel'

export function logStmt(
  db: D1Database,
  p: {
    action: LogAction
    listTitle: string
    itemTitle: string
    name: string
    email: string
    message: string | null
    messagePublic: boolean
  },
) {
  return db
    .prepare(
      'INSERT INTO logs (at, action, list_title, item_title, name, email, message, message_public) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      new Date().toISOString(),
      p.action,
      p.listTitle,
      p.itemTitle,
      p.name,
      p.email,
      p.message,
      p.messagePublic ? 1 : 0,
    )
}

// Les noms de colonnes viennent toujours du code serveur, jamais du client.
export async function patchRow(
  db: D1Database,
  table: 'lists' | 'categories' | 'items',
  id: string,
  fields: Record<string, string | number | null>,
) {
  const cols = Object.keys(fields)
  if (cols.length === 0) return
  await db
    .prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
    .bind(...Object.values(fields), id)
    .run()
}
