// RPC minimal vers le worker SQLite. Pas de Comlink : 25 lignes suffisent.
const worker = new Worker(new URL('./db.worker.ts', import.meta.url), { type: 'module' })

let seq = 0
const attente = new Map<number, { ok: (v: any) => void; ko: (e: any) => void }>()

worker.onmessage = (e: MessageEvent) => {
  const { id, result, error } = e.data
  const p = attente.get(id)
  if (!p) return
  attente.delete(id)
  error ? p.ko(new Error(error)) : p.ok(result)
}

// Point d'accroche générique pour la synchro Drive et les widgets dérivés
// (moyenne kcal…) : db.ts ignore tout de leurs besoins, il notifie juste
// qu'une écriture a eu lieu, à qui veut bien écouter.
const OPS_ECRITURE = new Set(['ajouter', 'ajouterManuel', 'supprimer', 'creerRepas', 'supprimerRepas', 'copier', 'definirPoids', 'reinitialiser'])
const ecouteursEcriture: (() => void)[] = []
export function surModification(cb: () => void) { ecouteursEcriture.push(cb) }

export function call<T = any>(op: string, payload?: any): Promise<T> {
  const id = ++seq
  return new Promise((ok, ko) => {
    attente.set(id, {
      ok: (v) => { if (OPS_ECRITURE.has(op)) ecouteursEcriture.forEach((cb) => cb()); ok(v) },
      ko,
    })
    worker.postMessage({ id, op, payload })
  })
}

export async function demarrer() {
  const res = await fetch(`${import.meta.env.BASE_URL}ingredients.json`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`ingredients.json introuvable (${res.status})`)
  return call('init', await res.json())
}
