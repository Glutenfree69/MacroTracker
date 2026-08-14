// Sauvegarde automatique vers Google Drive. OPFS reste la source de vérité
// locale ; Drive n'est qu'une copie de secours + un pont entre machines.
// Aucun backend : OAuth2 client-side pur (Google Identity Services), scope
// drive.file — l'app ne voit que les fichiers qu'elle crée elle-même.
import { call } from './db'

declare global {
  interface Window { google: any }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const NOM_FICHIER = 'macrotracker.sqlite'
const DEBOUNCE_MS = 2500

const CLE_CONNECTE = 'macrotracker.drive.connecte'
const CLE_FILE_ID = 'macrotracker.drive.fileId'
const CLE_DERNIER_SYNC = 'macrotracker.drive.lastSyncedModifiedTime'
const CLE_EN_ATTENTE = 'macrotracker.drive.pendingChangeAt'

export type EtatDrive = {
  disponible: boolean
  connecte: boolean
  enAttente: boolean
  dernierSyncLe: string | null
  erreur: string | null
  reconnexionRequise: boolean
}

let jeton: { valeur: string; expireLe: number } | null = null
let gisCharge: Promise<void> | null = null
let tokenClient: any = null
let syncEnCours = false
let minuteur: ReturnType<typeof setTimeout> | null = null
let erreur: string | null = null
let reconnexionRequise = false
const ecouteursEtat: (() => void)[] = []
let onImportDistant: ((octets: Uint8Array) => void | Promise<void>) | null = null

export function surChangementEtat(cb: () => void) { ecouteursEtat.push(cb) }
/** cb applique les octets reçus de Drive (importer + rafraîchir l'UI) — voir appliquerRestauration() dans app.ts. */
export function surImportDistant(cb: (octets: Uint8Array) => void | Promise<void>) { onImportDistant = cb }
function notifier() { ecouteursEtat.forEach((cb) => cb()) }

export function etatDrive(): EtatDrive {
  return {
    disponible: !!CLIENT_ID,
    connecte: localStorage.getItem(CLE_CONNECTE) === '1',
    enAttente: localStorage.getItem(CLE_EN_ATTENTE) !== null,
    dernierSyncLe: localStorage.getItem(CLE_DERNIER_SYNC),
    erreur,
    reconnexionRequise,
  }
}

/* ── Google Identity Services : chargement paresseux + token ───────── */

function chargerGis(): Promise<void> {
  if (gisCharge) return gisCharge
  gisCharge = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Impossible de charger Google Identity Services'))
    document.head.appendChild(s)
  })
  return gisCharge
}

async function obtenirTokenClient() {
  await chargerGis()
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {},
    })
  }
  return tokenClient
}

// Un seul token client réutilisé : le callback est réassigné à chaque appel,
// c'est le pattern documenté par Google pour distinguer plusieurs flux.
function demanderToken(prompt: '' | 'none'): Promise<{ access_token: string; expires_in: number }> {
  return new Promise((resolve, reject) => {
    obtenirTokenClient().then((client) => {
      client.callback = (reponse: any) =>
        reponse.error ? reject(new Error(reponse.error)) : resolve(reponse)
      client.error_callback = (err: any) =>
        reject(new Error(err?.message ?? err?.type ?? "Échec de l'authentification Google"))
      client.requestAccessToken({ prompt })
    }, reject)
  })
}

/** Token en mémoire uniquement, jamais persisté. Tentative silencieuse seulement. */
async function jetonValide(): Promise<string> {
  if (jeton && jeton.expireLe - Date.now() > 60_000) return jeton.valeur
  try {
    const reponse = await demanderToken('none')
    jeton = { valeur: reponse.access_token, expireLe: Date.now() + reponse.expires_in * 1000 }
    reconnexionRequise = false
    return jeton.valeur
  } catch (e) {
    reconnexionRequise = true
    throw e
  }
}

/* ── Appels REST Drive ──────────────────────────────────────────────
   fetch direct, CORS natif sur www.googleapis.com : aucun proxy serveur. */

async function requeteDrive(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await jetonValide()
  const res = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Drive ${res.status} : ${await res.text()}`)
  return res
}

async function chercherFichierExistant(): Promise<string | null> {
  const q = encodeURIComponent(`name='${NOM_FICHIER}' and trashed=false`)
  const res = await requeteDrive(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`)
  const { files } = await res.json()
  return files?.[0]?.id ?? null
}

async function creerFichierDrive(octets: Uint8Array): Promise<{ id: string; modifiedTime: string }> {
  const frontiere = 'macrotracker-' + Math.random().toString(36).slice(2)
  const corps = new Blob([
    `--${frontiere}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: NOM_FICHIER, mimeType: 'application/vnd.sqlite3' }) + '\r\n',
    `--${frontiere}\r\nContent-Type: application/vnd.sqlite3\r\n\r\n`,
    octets as BlobPart,
    `\r\n--${frontiere}--`,
  ])
  const res = await requeteDrive(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime',
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${frontiere}` }, body: corps },
  )
  return res.json()
}

async function mettreAJourFichierDrive(fileId: string, octets: Uint8Array): Promise<{ modifiedTime: string }> {
  const res = await requeteDrive(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=modifiedTime`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/vnd.sqlite3' }, body: octets as BodyInit },
  )
  return res.json()
}

async function fraicheurDrive(fileId: string): Promise<string> {
  const res = await requeteDrive(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime`)
  return (await res.json()).modifiedTime
}

async function telechargerDrive(fileId: string): Promise<Uint8Array> {
  const res = await requeteDrive(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)
  return new Uint8Array(await res.arrayBuffer())
}

/* ── Flux exposés ────────────────────────────────────────────────── */

export async function connecter(): Promise<void> {
  erreur = null
  try {
    const reponse = await demanderToken('')
    jeton = { valeur: reponse.access_token, expireLe: Date.now() + reponse.expires_in * 1000 }
    reconnexionRequise = false
    localStorage.setItem(CLE_CONNECTE, '1')

    let fileId = localStorage.getItem(CLE_FILE_ID) ?? (await chercherFichierExistant())
    if (!fileId) {
      const octets = await call<Uint8Array>('exporter')
      const cree = await creerFichierDrive(octets)
      fileId = cree.id
      localStorage.setItem(CLE_DERNIER_SYNC, cree.modifiedTime)
    }
    localStorage.setItem(CLE_FILE_ID, fileId)
    notifier()
    await resoudreFraicheur()
  } catch (e: any) {
    erreur = e?.message ?? String(e)
    notifier()
  }
}

export function deconnecter(): void {
  // fileId et lastSyncedModifiedTime survivent : une reconnexion réutilise le
  // même fichier Drive au lieu d'en recréer un.
  try { window.google?.accounts?.oauth2?.revoke(jeton?.valeur ?? '', () => {}) } catch {}
  jeton = null
  erreur = null
  reconnexionRequise = false
  localStorage.removeItem(CLE_CONNECTE)
  notifier()
}

export function planifierSync(): void {
  if (!CLIENT_ID || localStorage.getItem(CLE_CONNECTE) !== '1') return
  localStorage.setItem(CLE_EN_ATTENTE, new Date().toISOString())
  notifier()
  if (minuteur) clearTimeout(minuteur)
  minuteur = setTimeout(synchroniser, DEBOUNCE_MS)
}

export async function synchroniser(): Promise<void> {
  if (syncEnCours || localStorage.getItem(CLE_CONNECTE) !== '1') return
  syncEnCours = true
  try {
    const octets = await call<Uint8Array>('exporter')
    let fileId = localStorage.getItem(CLE_FILE_ID)
    const resultat = fileId
      ? await mettreAJourFichierDrive(fileId, octets)
      : await creerFichierDrive(octets).then((cree) => {
          fileId = cree.id
          localStorage.setItem(CLE_FILE_ID, fileId)
          return cree
        })
    localStorage.setItem(CLE_DERNIER_SYNC, resultat.modifiedTime)
    localStorage.removeItem(CLE_EN_ATTENTE)
    erreur = null
  } catch (e: any) {
    erreur = e?.message ?? String(e) // pendingChangeAt n'est PAS effacé : retenté à la prochaine écriture/démarrage
  } finally {
    syncEnCours = false
    notifier()
  }
}

/** Le plus récent gagne, sans merge : driveTime vient de Drive lui-même (autoritatif). */
async function resoudreFraicheur(): Promise<void> {
  const fileId = localStorage.getItem(CLE_FILE_ID)
  if (!fileId) { await synchroniser(); return }

  const driveTime = await fraicheurDrive(fileId)
  const enAttenteLe = localStorage.getItem(CLE_EN_ATTENTE)
  const localTime = enAttenteLe ?? localStorage.getItem(CLE_DERNIER_SYNC)

  if (!localTime || new Date(driveTime).getTime() > new Date(localTime).getTime()) {
    const octets = await telechargerDrive(fileId)
    localStorage.setItem(CLE_DERNIER_SYNC, driveTime)
    localStorage.removeItem(CLE_EN_ATTENTE)
    await onImportDistant?.(octets)
  } else if (enAttenteLe || new Date(localTime).getTime() > new Date(driveTime).getTime()) {
    await synchroniser()
  }
  erreur = null
  notifier()
}

export async function initialiserDrive(): Promise<void> {
  if (!CLIENT_ID || localStorage.getItem(CLE_CONNECTE) !== '1') return
  try {
    await resoudreFraicheur()
  } catch (e: any) {
    erreur = e?.message ?? String(e)
    notifier()
  }
}
