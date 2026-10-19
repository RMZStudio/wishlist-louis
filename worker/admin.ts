import { Hono } from 'hono'
import type { Context } from 'hono'
import { clean, logStmt, patchRow, uid, uniqueSlug } from './util'
import type { AppEnv } from './types'

export const admin = new Hono<AppEnv>()

admin.use('*', async (c, next) => {
  if (!c.get('isAdmin')) return c.json({ error: 'Non autorisé.' }, 401)
  await next()
})

type Body = Record<string, unknown>
const readBody = async (c: Context<AppEnv>) => (await c.req.json().catch(() => ({}))) as Body
const ok = (c: Context<AppEnv>) => c.json({ ok: true })

async function deleteFiles(c: Context<AppEnv>, sql: string, id: string) {
  const { results } = await c.env.DB.prepare(sql).bind(id).all<{ file_key: string }>()
  if (results.length > 0) await c.env.IMAGES.delete(results.map((r) => r.file_key))
}

// --- Listes ----------------------------------------------------------------
admin.post('/lists', async (c) => {
  const b = await readBody(c)
  const title = clean(b.title, 120)
  if (!title) return c.json({ error: 'Le titre est obligatoire.' }, 400)
  const id = uid()
  const slug = await uniqueSlug(c.env.DB, title)
  await c.env.DB.prepare(
    `INSERT INTO lists (id, slug, title, position)
     VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM lists))`,
  )
    .bind(id, slug, title)
    .run()
  return c.json({ id, slug })
})

admin.patch('/lists/:id', async (c) => {
  const id = c.req.param('id')
  const b = await readBody(c)
  const f: Record<string, string | number | null> = {}
  if (typeof b.title === 'string') {
    const t = clean(b.title, 120)
    if (!t) return c.json({ error: 'Le titre est obligatoire.' }, 400)
    f.title = t
  }
  if (typeof b.description === 'string') f.description = b.description.slice(0, 2000)
  if (typeof b.is_public === 'boolean') f.is_public = b.is_public ? 1 : 0
  if ('theme' in b) f.theme = b.theme === 'noel' || b.theme === 'anniversaire' ? b.theme : null
  if (typeof b.slug === 'string' && b.slug.trim()) f.slug = await uniqueSlug(c.env.DB, b.slug, id)
  await patchRow(c.env.DB, 'lists', id, f)
  const row = await c.env.DB.prepare('SELECT slug FROM lists WHERE id = ?').bind(id).first<{ slug: string }>()
  return c.json({ ok: true, slug: row?.slug })
})

admin.delete('/lists/:id', async (c) => {
  const id = c.req.param('id')
  await deleteFiles(
    c,
    'SELECT ii.file_key FROM item_images ii JOIN items i ON i.id = ii.item_id WHERE i.list_id = ?',
    id,
  )
  await c.env.DB.prepare('DELETE FROM lists WHERE id = ?').bind(id).run()
  return ok(c)
})

// --- Réordonnancement (listes, catégories, items, images) -------------------
const ORDERABLE: Record<string, string> = {
  lists: 'lists',
  categories: 'categories',
  items: 'items',
  images: 'item_images',
}

admin.post('/reorder', async (c) => {
  const b = await readBody(c)
  const table = typeof b.table === 'string' ? ORDERABLE[b.table] : undefined
  if (!table || !Array.isArray(b.ids)) return c.json({ error: 'Requête invalide.' }, 400)
  const ids = b.ids.filter((x): x is string => typeof x === 'string')
  if (ids.length === 0) return ok(c)
  await c.env.DB.batch(
    ids.map((id, i) => c.env.DB.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`).bind(i, id)),
  )
  return ok(c)
})

// --- Catégories --------------------------------------------------------------
admin.post('/lists/:id/categories', async (c) => {
  const b = await readBody(c)
  const title = clean(b.title, 120)
  if (!title) return c.json({ error: 'Le nom est obligatoire.' }, 400)
  const id = uid()
  const listId = c.req.param('id')
  await c.env.DB.prepare(
    `INSERT INTO categories (id, list_id, title, position)
     VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM categories WHERE list_id = ?))`,
  )
    .bind(id, listId, title, listId)
    .run()
  return c.json({ id })
})

admin.patch('/categories/:id', async (c) => {
  const b = await readBody(c)
  const title = clean(b.title, 120)
  if (!title) return c.json({ error: 'Le nom est obligatoire.' }, 400)
  await patchRow(c.env.DB, 'categories', c.req.param('id'), { title })
  return ok(c)
})

// Les items d'une catégorie supprimée sont conservés (category_id passe à NULL).
admin.delete('/categories/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(c.req.param('id')).run()
  return ok(c)
})

// --- Items -------------------------------------------------------------------
admin.post('/lists/:id/items', async (c) => {
  const b = await readBody(c)
  const title = clean(b.title, 200) || 'Nouvel item'
  const categoryId = typeof b.category_id === 'string' ? b.category_id : null
  const listId = c.req.param('id')
  const id = uid()
  await c.env.DB.prepare(
    `INSERT INTO items (id, list_id, category_id, title, position)
     VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM items WHERE list_id = ?))`,
  )
    .bind(id, listId, categoryId, title, listId)
    .run()
  return c.json({ id })
})

admin.patch('/items/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const b = await readBody(c)
  const f: Record<string, string | number | null> = {}

  if (typeof b.title === 'string') {
    const t = clean(b.title, 200)
    if (!t) return c.json({ error: 'Le titre est obligatoire.' }, 400)
    f.title = t
  }
  if (typeof b.description === 'string') f.description = b.description.slice(0, 5000)
  if ('price' in b) {
    f.price = typeof b.price === 'number' && Number.isFinite(b.price) && b.price >= 0 ? b.price : null
  }
  if ('category_id' in b) {
    const next = typeof b.category_id === 'string' && b.category_id ? b.category_id : null
    const cur = await db
      .prepare('SELECT category_id FROM items WHERE id = ?')
      .bind(id)
      .first<{ category_id: string | null }>()
    if (cur && cur.category_id !== next) {
      f.category_id = next
      // l'item change de groupe : on le place à la fin
      const pos = await db
        .prepare(
          'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM items WHERE list_id = (SELECT list_id FROM items WHERE id = ?)',
        )
        .bind(id)
        .first<{ p: number }>()
      f.position = pos?.p ?? 0
    }
  }
  await patchRow(db, 'items', id, f)

  if (Array.isArray(b.links)) {
    const links: { label: string; url: string }[] = []
    for (const raw of b.links as Body[]) {
      const url = clean(raw?.url, 2000)
      try {
        const u = new URL(url)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
        links.push({ label: clean(raw?.label, 80) || u.hostname.replace(/^www\./, ''), url: u.toString() })
      } catch {
        // URL invalide : ignorée
      }
    }
    await db.batch([
      db.prepare('DELETE FROM item_links WHERE item_id = ?').bind(id),
      ...links.map((l, i) =>
        db
          .prepare('INSERT INTO item_links (id, item_id, label, url, position) VALUES (?, ?, ?, ?, ?)')
          .bind(uid(), id, l.label, l.url, i),
      ),
    ])
  }
  return ok(c)
})

admin.delete('/items/:id', async (c) => {
  const id = c.req.param('id')
  await deleteFiles(c, 'SELECT file_key FROM item_images WHERE item_id = ?', id)
  await c.env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run()
  return ok(c)
})

// Annulation d'une réservation par l'admin (sans l'e-mail du visiteur)
admin.delete('/items/:id/reservation', async (c) => {
  const db = c.env.DB
  const itemId = c.req.param('id')
  const row = await db
    .prepare(
      `SELECT r.name, r.email, r.message, r.message_public, i.title AS item_title, l.title AS list_title
       FROM reservations r JOIN items i ON i.id = r.item_id JOIN lists l ON l.id = i.list_id
       WHERE r.item_id = ?`,
    )
    .bind(itemId)
    .first<{
      name: string
      email: string
      message: string | null
      message_public: number
      item_title: string
      list_title: string
    }>()
  if (!row) return c.json({ error: 'Aucune réservation.' }, 404)
  await db.batch([
    db.prepare('DELETE FROM reservations WHERE item_id = ?').bind(itemId),
    logStmt(db, {
      action: 'admin_cancel',
      listTitle: row.list_title,
      itemTitle: row.item_title,
      name: row.name,
      email: row.email,
      message: row.message,
      messagePublic: !!row.message_public,
    }),
  ])
  return ok(c)
})

// --- Images ------------------------------------------------------------------
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

async function storeImage(c: Context<AppEnv>, itemId: string, data: ArrayBuffer, contentType: string, ext: string) {
  const fileKey = `items/${itemId}/${uid()}.${ext}`
  await c.env.IMAGES.put(fileKey, data, { httpMetadata: { contentType } })
  const id = uid()
  await c.env.DB.prepare(
    `INSERT INTO item_images (id, item_id, file_key, position)
     VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM item_images WHERE item_id = ?))`,
  )
    .bind(id, itemId, fileKey, itemId)
    .run()
  return { id, file_key: fileKey }
}

admin.post('/items/:id/images', async (c) => {
  const itemId = c.req.param('id')
  const db = c.env.DB
  const exists = await db.prepare('SELECT id FROM items WHERE id = ?').bind(itemId).first()
  if (!exists) return c.json({ error: 'Item introuvable.' }, 404)

  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return c.json({ error: 'Fichier manquant.' }, 400)
  const ext = EXT[file.type]
  if (!ext) return c.json({ error: 'Format non supporté (JPG, PNG, WebP ou GIF).' }, 400)
  if (file.size > 5 * 1024 * 1024) return c.json({ error: 'Image trop lourde (5 Mo max).' }, 400)

  return c.json(await storeImage(c, itemId, await file.arrayBuffer(), file.type, ext))
})

// Ajout d'une image à partir de son adresse : le serveur la télécharge et la range dans R2.
admin.post('/items/:id/images/from-url', async (c) => {
  const itemId = c.req.param('id')
  const exists = await c.env.DB.prepare('SELECT id FROM items WHERE id = ?').bind(itemId).first()
  if (!exists) return c.json({ error: 'Item introuvable.' }, 404)

  const b = await readBody(c)
  let url: URL
  try {
    url = new URL(clean(b.url, 2000))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocole')
  } catch {
    return c.json({ error: 'Adresse invalide : elle doit commencer par https://' }, 400)
  }

  let res: Response
  try {
    res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WishlistBot/1.0)', Accept: 'image/*' },
    })
  } catch {
    return c.json({ error: 'Impossible de joindre cette adresse.' }, 400)
  }
  if (!res.ok) {
    return c.json({ error: `Le site a refusé le téléchargement (code ${res.status}). Enregistre l’image puis envoie-la en fichier.` }, 400)
  }

  let type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type === 'image/jpg') type = 'image/jpeg'
  if (!EXT[type]) {
    const fromPath = url.pathname.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/)?.[1]
    if (fromPath) type = fromPath === 'png' ? 'image/png' : fromPath === 'webp' ? 'image/webp' : fromPath === 'gif' ? 'image/gif' : 'image/jpeg'
  }
  const ext = EXT[type]
  if (!ext) return c.json({ error: 'Cette adresse ne mène pas à une image (JPG, PNG, WebP ou GIF).' }, 400)

  const data = await res.arrayBuffer()
  if (data.byteLength > 5 * 1024 * 1024) return c.json({ error: 'Image trop lourde (5 Mo max).' }, 400)
  return c.json(await storeImage(c, itemId, data, type, ext))
})

admin.delete('/images/:id', async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT file_key FROM item_images WHERE id = ?')
    .bind(id)
    .first<{ file_key: string }>()
  if (row) {
    await c.env.DB.prepare('DELETE FROM item_images WHERE id = ?').bind(id).run()
    await c.env.IMAGES.delete(row.file_key)
  }
  return ok(c)
})

// --- Journal -----------------------------------------------------------------
admin.get('/logs', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, at, action, list_title, item_title, name, email, message, message_public FROM logs ORDER BY id DESC LIMIT 500',
  ).all()
  return c.json(results)
})
