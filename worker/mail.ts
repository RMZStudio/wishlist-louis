// Envoi d'e-mails via Resend (https://resend.com). Entièrement facultatif :
// sans clé API, rien n'est envoyé et le site fonctionne comme avant.
import type { Env } from './types'

interface Mail {
  to: string[]
  subject: string
  lines: string[]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function send(env: Env, mail: Mail) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || mail.to.length === 0) return
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.lines.join('\n'),
        // tout ce que le visiteur a saisi est échappé avant d'être mis en HTML
        html: `<div style="font-family:sans-serif;line-height:1.5">${mail.lines.map(esc).join('<br>')}</div>`,
      }),
    })
    if (!res.ok) console.error('E-mail refusé par Resend', res.status, await res.text())
  } catch (e) {
    console.error('Envoi d’e-mail impossible', e)
  }
}

export interface MailEvent {
  kind: 'reserve' | 'cancel'
  origin: string
  slug: string
  listTitle: string
  itemTitle: string
  name: string
  email: string
  message: string | null
  messagePublic: boolean
}

// Envoie la confirmation au visiteur et l'alerte aux admins. Ne lève jamais d'erreur.
export async function notify(env: Env, ev: MailEvent) {
  const admins = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const link = `${ev.origin}/${ev.slug}`
  const reserve = ev.kind === 'reserve'

  const visitor: Mail = reserve
    ? {
        to: [ev.email],
        subject: `Ta réservation : ${ev.itemTitle}`,
        lines: [
          `Bonjour ${ev.name},`,
          '',
          'Ta réservation est bien enregistrée :',
          `Cadeau : ${ev.itemTitle}`,
          `Liste : ${ev.listTitle}`,
          ...(ev.message ? [`Ton message : ${ev.message}`] : []),
          '',
          `Un empêchement ? Tu peux l’annuler à tout moment sur ${link} : clique sur « Annuler ma réservation » et saisis cette adresse e-mail.`,
          '',
          'Merci !',
        ],
      }
    : {
        to: [ev.email],
        subject: `Réservation annulée : ${ev.itemTitle}`,
        lines: [
          `Bonjour ${ev.name},`,
          '',
          `Ta réservation de « ${ev.itemTitle} » (liste « ${ev.listTitle} ») a bien été annulée.`,
          `Le cadeau est de nouveau disponible sur ${link}.`,
        ],
      }

  const adminMail: Mail = {
    to: admins,
    subject: `${reserve ? 'Réservation' : 'Annulation'} : ${ev.itemTitle} (${ev.name})`,
    lines: [
      reserve ? 'Nouvelle réservation.' : 'Une réservation a été annulée.',
      '',
      `Cadeau : ${ev.itemTitle}`,
      `Liste : ${ev.listTitle}`,
      `Qui : ${ev.name} (${ev.email})`,
      ...(ev.message ? [`Message ${ev.messagePublic ? 'public' : 'privé'} : ${ev.message}`] : []),
      '',
      `Voir la liste : ${link}`,
    ],
  }

  await Promise.all([send(env, visitor), send(env, adminMail)])
}
