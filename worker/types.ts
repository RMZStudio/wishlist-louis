export interface Env {
  DB: D1Database
  IMAGES: R2Bucket
  ADMIN_PASSWORD: string
  SESSION_SECRET: string
  // E-mails (facultatifs) : sans RESEND_API_KEY et MAIL_FROM, rien n'est envoyé.
  RESEND_API_KEY?: string
  MAIL_FROM?: string
  ADMIN_EMAILS?: string
}

export type AppEnv = { Bindings: Env; Variables: { isAdmin: boolean } }
