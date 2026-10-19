import { Hono } from 'hono'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import { admin } from './admin'
import { clean, logStmt, safeEqual } from './util'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()
const SESSION_SECONDS = 60 * 60 * 24 * 30
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// --- Session : on lit le cookie à chaque requête ---------------------------
app.use('*', async (c, next) => {
  let ok = false
  const token = getCookie(c, 'session')
  if (token) {
    try {
      await verify(token, c.env.SESSION_SECRET, 'HS256')
      ok = true
    } catch {
      // cookie expiré ou invalide : on reste visiteur
    }
  }
  c.set('isAdmin', ok)
  await next()
})

app.get('/api/me', (c) => c.json({ admin: c.get('isAdmin') }))

app.post('/api/login', async (c) => {
  const db = c.env.DB
  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  const since = Date.now() - 15 * 60 * 1000
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM auth_fails WHERE ip = ? AND at > ?')
    .bind(ip, since)
    .first<{ n: number }>()
  if ((row?.n ?? 0) >= 8) {
    return c.json({ error: 'Trop de tentatives. Réessaie dans 15 minutes.' }, 429)
  }

  const body = (await c.req.json().catch(() => ({}))) as { password?: unknown }
  const password = typeof body.password === 'string' ? body.password : ''
  if (!(await safeEqual(password, c.env.ADMIN_PASSWORD))) {
    await db.batch([
      db.prepare('INSERT INTO auth_fails (ip, at) VALUES (?, ?)').bind(ip, Date.now()),
      db.prepare('DELETE FROM auth_fails WHERE at < ?').bind(since),
    ])
    return c.json({ error: 'Mot de passe incorrect.' }, 401)
  }

  const token = await sign(
    { exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS },
    c.env.SESSION_SECRET,
    'HS256',
  )
  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_SECONDS,
  })
  return c.json({ ok: true })
})

app.post('/api/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ ok: true })
})

// --- Listes ----------------------------------------------------------------
type ListRow = {
  id: string
  slug: string
  title: string
  description: string
  is_public: number
  theme: string | null
  item_count: number
  reserved_count: number
}

app.get('/api/lists', async (c) => {
  const where = c.get('isAdmin') ? '' : 'WHERE l.is_public = 1'
  const { results } = await c.env.DB.prepare(
    `SELECT l.id, l.slug, l.title, l.description, l.is_public, l.theme,
       (SELECT COUNT(*) FROM items i WHERE i.list_id = l.id) AS item_count,
       (SELECT COUNT(*) FROM items i JOIN reservations r ON r.item_id = i.id WHERE i.list_id = l.id) AS reserved_count
     FROM lists l ${where}
     ORDER BY l.position, l.created_at`,
  ).all<ListRow>()
  return c.json(results.map((r) => ({ ...r, is_public: !!r.is_public })))
})

type ItemRow = {
  id: string
  category_id: string | null
  title: string
  description: string
  price: number | null
}
type ChildRow = { item_id: string; id: string }
type ImageRow = ChildRow & { file_key: string }
type LinkRow = ChildRow & { label: string; url: string }
type ResaRow = {
  item_id: string
  name: string
  email: string
  message: string | null
  message_public: number
  created_at: string
}

function group<T extends { item_id: string }>(rows: T[]) {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const arr = map.get(r.item_id)
    if (arr) arr.push(r)
    else map.set(r.item_id, [r])
  }
  return map
}

app.get('/api/lists/:slug', async (c) => {
  const isAdmin = c.get('isAdmin')
  const db = c.env.DB
  const list = await db
    .prepare('SELECT id, slug, title, description, is_public, theme FROM lists WHERE slug = ?')
    .bind(c.req.param('slug'))
    .first<{
      id: string
      slug: string
      title: string
      description: string
      is_public: number
      theme: string | null
    }>()
  if (!list) return c.json({ error: 'Liste introuvable.' }, 404)
  if (!list.is_public && !isAdmin) return c.json({ error: 'private' }, 401)

  const id = list.id
  const [cats, items, imgs, links, resas] = await db.batch([
    db.prepare('SELECT id, title FROM categories WHERE list_id = ? ORDER BY position').bind(id),
    db
      .prepare('SELECT id, category_id, title, description, price FROM items WHERE list_id = ? ORDER BY position')
      .bind(id),
    db
      .prepare(
        'SELECT ii.id, ii.item_id, ii.file_key FROM item_images ii JOIN items i ON i.id = ii.item_id WHERE i.list_id = ? ORDER BY ii.position',
      )
      .bind(id),
    db
      .prepare(
        'SELECT il.id, il.item_id, il.label, il.url FROM item_links il JOIN items i ON i.id = il.item_id WHERE i.list_id = ? ORDER BY il.position',
      )
      .bind(id),
    db
      .prepare(
        'SELECT r.item_id, r.name, r.email, r.message, r.message_public, r.created_at FROM reservations r JOIN items i ON i.id = r.item_id WHERE i.list_id = ?',
      )
      .bind(id),
  ])

  const imgMap = group(imgs.results as ImageRow[])
  const linkMap = group(links.results as LinkRow[])
  const resaMap = new Map((resas.results as ResaRow[]).map((r) => [r.item_id, r]))

  return c.json({
    id: list.id,
    slug: list.slug,
    title: list.title,
    description: list.description,
    is_public: !!list.is_public,
    theme: list.theme,
    categories: cats.results,
    items: (items.results as ItemRow[]).map((it) => {
      const r = resaMap.get(it.id)
      return {
        ...it,
        images: (imgMap.get(it.id) ?? []).map((i) => ({ id: i.id, file_key: i.file_key })),
        links: (linkMap.get(it.id) ?? []).map((l) => ({ id: l.id, label: l.label, url: l.url })),
        reservation: r
          ? {
              name: r.name,
              email: isAdmin ? r.email : undefined,
              // le message privé n'est jamais envoyé aux visiteurs
              message: isAdmin || r.message_public ? r.message : null,
              message_public: !!r.message_public,
              created_at: r.created_at,
            }
          : null,
      }
    }),
  })
})

// --- Réservation / annulation (visiteurs) -----------------------------------
async function findItem(c: Context<AppEnv>, itemId: string) {
  const item = await c.env.DB.prepare(
    'SELECT i.id, i.title, l.title AS list_title, l.is_public FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = ?',
  )
    .bind(itemId)
    .first<{ id: string; title: string; list_title: string; is_public: number }>()
  if (!item || (!item.is_public && !c.get('isAdmin'))) return null
  return item
}

app.post('/api/items/:id/reserve', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const name = clean(body.name, 80)
  const email = clean(body.email, 200).toLowerCase()
  const message = clean(body.message, 500) || null
  const messagePublic = body.messagePublic === true

  if (!name) return c.json({ error: 'Indique ton nom.' }, 400)
  if (!EMAIL_RE.test(email)) return c.json({ error: 'Adresse e-mail invalide.' }, 400)

  const item = await findItem(c, c.req.param('id'))
  if (!item) return c.json({ error: 'Item introuvable.' }, 404)

  const db = c.env.DB
  try {
    await db.batch([
      db
        .prepare(
          'INSERT INTO reservations (item_id, name, email, message, message_public, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(item.id, name, email, message, messagePublic ? 1 : 0, new Date().toISOString()),
      logStmt(db, {
        action: 'reserve',
        listTitle: item.list_title,
        itemTitle: item.title,
        name,
        email,
        message,
        messagePublic,
      }),
    ])
  } catch (e) {
    if (String(e).toLowerCase().includes('constraint')) {
      return c.json({ error: 'Cet item vient d’être réservé par quelqu’un d’autre.' }, 409)
    }
    throw e
  }
  return c.json({ ok: true })
})

app.post('/api/items/:id/cancel', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const email = clean(body.email, 200).toLowerCase()

  const item = await findItem(c, c.req.param('id'))
  if (!item) return c.json({ error: 'Item introuvable.' }, 404)

  const db = c.env.DB
  const resa = await db
    .prepare('SELECT name, email, message, message_public FROM reservations WHERE item_id = ?')
    .bind(item.id)
    .first<{ name: string; email: string; message: string | null; message_public: number }>()
  if (!resa) return c.json({ error: 'Cet item n’est pas réservé.' }, 404)
  if (resa.email !== email) {
    return c.json({ error: 'Cette adresse ne correspond pas à celle de la réservation.' }, 403)
  }

  await db.batch([
    db.prepare('DELETE FROM reservations WHERE item_id = ?').bind(item.id),
    logStmt(db, {
      action: 'cancel',
      listTitle: item.list_title,
      itemTitle: item.title,
      name: resa.name,
      email: resa.email,
      message: resa.message,
      messagePublic: !!resa.message_public,
    }),
  ])
  return c.json({ ok: true })
})

// --- Images (R2) -----------------------------------------------------------
app.get('/img/*', async (c) => {
  const key = decodeURIComponent(c.req.path.slice('/img/'.length))
  const obj = await c.env.IMAGES.get(key)
  if (!obj) return c.notFound()
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  return new Response(obj.body, { headers })
})

app.route('/api/admin', admin)

export default app
