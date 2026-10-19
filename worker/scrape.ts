// Récupération automatique des infos d'un produit à partir de l'adresse de sa page.
// On lit les balises Open Graph (aperçus de liens) et les données JSON-LD (schema.org/Product).

export interface Scraped {
  title: string
  description: string
  price: number | null
  images: string[]
}

export type ScrapeResult = { ok: true; data: Scraped } | { ok: false; error: string }

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const PREVIEW_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uafaq.php)'
const BLOCKED = /robot|captcha|just a moment|access denied|attention required|bot verification|un instant/i
const MAX_IMAGES = 4

export const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e: string) => {
    const l = e.toLowerCase()
    if (l === 'amp') return '&'
    if (l === 'lt') return '<'
    if (l === 'gt') return '>'
    if (l === 'quot') return '"'
    if (l === 'apos') return "'"
    if (l === 'nbsp') return ' '
    const code = l.startsWith('#x') ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : m
  })

const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

function parsePrice(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null
  if (typeof v !== 'string') return null
  let s = v.replace(/[^\d.,]/g, '')
  if (!s) return null
  const comma = s.lastIndexOf(',')
  const dot = s.lastIndexOf('.')
  if (comma > -1 && dot > -1) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (comma > -1) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function offerPrice(v: unknown): number | null {
  if (!v) return null
  if (Array.isArray(v)) {
    for (const o of v) {
      const p = offerPrice(o)
      if (p !== null) return p
    }
    return null
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return parsePrice(o.price) ?? parsePrice(o.lowPrice) ?? offerPrice(o.priceSpecification) ?? offerPrice(o.offers)
  }
  return null
}

function imageUrls(v: unknown): string[] {
  if (!v) return []
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.flatMap(imageUrls)
  if (typeof v === 'object') {
    const o = v as { url?: unknown; contentUrl?: unknown }
    return imageUrls(o.url ?? o.contentUrl)
  }
  return []
}

function findProducts(node: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(node)) {
    node.forEach((n) => findProducts(n, out))
    return
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    const types = Array.isArray(o['@type']) ? o['@type'] : [o['@type']]
    if (types.some((t) => t === 'Product' || t === 'ProductGroup')) out.push(o)
    if (o['@graph']) findProducts(o['@graph'], out)
  }
}

async function extract(res: Response, pageUrl: string): Promise<Scraped | null> {
  const meta = new Map<string, string[]>()
  const ldScripts: string[] = []
  let ldBuf = ''
  let titleBuf = ''

  await new HTMLRewriter()
    .on('meta', {
      element(el) {
        const key = (el.getAttribute('property') ?? el.getAttribute('name') ?? el.getAttribute('itemprop') ?? '').toLowerCase()
        const content = el.getAttribute('content')
        if (!key || !content) return
        const arr = meta.get(key)
        if (arr) arr.push(content)
        else meta.set(key, [content])
      },
    })
    .on('script[type="application/ld+json"]', {
      text(t) {
        ldBuf += t.text
        if (t.lastInTextNode) {
          ldScripts.push(ldBuf)
          ldBuf = ''
        }
      },
    })
    .on('head > title', {
      text(t) {
        titleBuf += t.text
      },
    })
    .transform(res)
    .arrayBuffer()

  const products: Record<string, unknown>[] = []
  for (const raw of ldScripts) {
    try {
      findProducts(JSON.parse(raw), products)
    } catch {
      // bloc JSON-LD invalide : ignoré
    }
  }
  const prod = products[0]
  const first = (...keys: string[]) => {
    for (const k of keys) {
      const v = meta.get(k)?.[0]
      if (v) return v
    }
    return ''
  }

  const title = stripTags(
    (typeof prod?.name === 'string' && prod.name) || first('og:title', 'twitter:title') || decode(titleBuf),
  )
  if (!title) return null

  const description = stripTags(
    (typeof prod?.description === 'string' && prod.description) || first('og:description', 'description', 'twitter:description'),
  ).slice(0, 1500)

  const price =
    offerPrice(prod?.offers) ?? parsePrice(first('product:price:amount', 'og:price:amount', 'price'))

  const candidates = [
    ...imageUrls(prod?.image),
    ...(meta.get('og:image') ?? []),
    ...(meta.get('og:image:url') ?? []),
    ...(meta.get('twitter:image') ?? []),
  ]
  const images: string[] = []
  for (const c of candidates) {
    try {
      const u = new URL(c.trim(), pageUrl)
      if ((u.protocol === 'http:' || u.protocol === 'https:') && !images.includes(u.toString())) images.push(u.toString())
    } catch {
      // adresse d'image invalide : ignorée
    }
  }
  return { title, description, price, images: images.slice(0, MAX_IMAGES) }
}

export async function scrapeProduct(url: URL): Promise<ScrapeResult> {
  // Certains sites ne montrent leurs balises qu'aux robots d'aperçu de liens : on essaie les deux.
  for (const ua of [BROWSER_UA, PREVIEW_UA]) {
    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
        },
      })
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) continue
      const data = await extract(res, res.url || url.toString())
      if (data && !BLOCKED.test(data.title)) return { ok: true, data }
    } catch {
      // on tente l'autre identification
    }
  }
  return {
    ok: false,
    error:
      'Impossible de lire cette page automatiquement. Certains sites, comme Amazon, bloquent ce type de lecture.',
  }
}

export async function fetchImageBytes(src: string, referer: string) {
  try {
    const res = await fetch(src, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': BROWSER_UA, Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.5', Referer: referer },
    })
    if (!res.ok) return null
    let type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (type === 'image/jpg') type = 'image/jpeg'
    if (!IMAGE_EXT[type]) {
      const m = new URL(src).pathname.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/)?.[1]
      if (m) type = m === 'png' ? 'image/png' : m === 'webp' ? 'image/webp' : m === 'gif' ? 'image/gif' : 'image/jpeg'
    }
    const ext = IMAGE_EXT[type]
    if (!ext) return null
    const data = await res.arrayBuffer()
    if (data.byteLength > 5 * 1024 * 1024) return null
    return { data, type, ext }
  } catch {
    return null
  }
}
