export interface Env {
  DB: D1Database
  IMAGES: R2Bucket
  ADMIN_PASSWORD: string
  SESSION_SECRET: string
}

export type AppEnv = { Bindings: Env; Variables: { isAdmin: boolean } }
