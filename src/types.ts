import type { ThemeKey } from './lib'

export interface ListSummary {
  id: string
  slug: string
  title: string
  description: string
  is_public: boolean
  theme: ThemeKey | null
  item_count: number
  reserved_count: number
}

export interface Reservation {
  name: string
  email?: string
  message: string | null
  message_public: boolean
  created_at: string
}

export interface ItemImage {
  id: string
  file_key: string
}

export interface ItemLink {
  id: string
  label: string
  url: string
}

export interface Item {
  id: string
  category_id: string | null
  title: string
  description: string
  price: number | null
  images: ItemImage[]
  links: ItemLink[]
  reservation: Reservation | null
}

export interface Category {
  id: string
  title: string
}

export interface WishList {
  id: string
  slug: string
  title: string
  description: string
  is_public: boolean
  theme: ThemeKey | null
  categories: Category[]
  items: Item[]
}

export interface LogEntry {
  id: number
  at: string
  action: 'reserve' | 'cancel' | 'admin_cancel'
  list_title: string
  item_title: string
  name: string
  email: string
  message: string | null
  message_public: number
}
