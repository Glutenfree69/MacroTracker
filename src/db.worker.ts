/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

// Tout SQLite vit ici. Safari n'autorise createSyncAccessHandle() que dans un
// worker, donc le VFS OPFS-SAHPool ne peut pas tourner sur le thread principal.
// (SAHPool et pas le VFS OPFS classique : celui-là exige SharedArrayBuffer,
// donc des en-têtes COOP/COEP, que GitHub Pages ne permet pas de définir.)

let db: any
let pool: any
// Gardé pour pouvoir re-semer la table ingrédients après une restauration.
let graine: { version: string; ingredients: any[] }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ingredient (
  id TEXT PRIMARY KEY, nom TEXT NOT NULL, categorie TEXT NOT NULL,
  kcal REAL NOT NULL, proteines REAL NOT NULL, glucides REAL NOT NULL,
  lipides REAL NOT NULL, fibres REAL NOT NULL, note TEXT
);
CREATE TABLE IF NOT EXISTS portion (
  ingredient_id TEXT NOT NULL, label TEXT NOT NULL, grammes REAL NOT NULL
);

-- Une ligne = un aliment pesé dans un repas. Les macros sont figées ici en
-- valeur absolue au moment de la saisie : corriger un ingrédient en novembre
-- ne doit pas réécrire tes journées de mars.
CREATE TABLE IF NOT EXISTS ligne (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jour TEXT NOT NULL, repas TEXT NOT NULL,
  ingredient_id TEXT NOT NULL, nom TEXT NOT NULL, grammes REAL NOT NULL,
  kcal REAL NOT NULL, proteines REAL NOT NULL, glucides REAL NOT NULL,
  lipides REAL NOT NULL, fibres REAL NOT NULL,
  cree_le TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ligne_jour ON ligne(jour, repas);

-- Objectifs datés : tu changes de cap sans falsifier l'historique.
CREATE TABLE IF NOT EXISTS objectif (
  depuis TEXT PRIMARY KEY,
  kcal REAL NOT NULL, proteines REAL NOT NULL,
  glucides REAL NOT NULL, lipides REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
`

function exec(sql: string, bind: any[] = []) {
  return db.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' })
}

function ouvrirBase() {
  db = new pool.OpfsSAHPoolDb('/macros.sqlite')
  db.exec(SCHEMA)
  // Un objectif par défaut valable « depuis toujours », pour qu'une journée
  // résolve toujours quelque chose même avant le premier réglage.
  exec(
    `INSERT INTO objectif VALUES ('1970-01-01', 2400, 180, 250, 80)
     ON CONFLICT(depuis) DO NOTHING`,
  )
}

/** Remplace la table ingrédients si le build a changé. Les lignes de log n'y touchent pas. */
function seed(payload: { version: string; ingredients: any[] }) {
  const [row] = exec(`SELECT valeur FROM meta WHERE cle='ingredients_version'`)
  if (row?.valeur === payload.version) return { seeded: false }

  db.transaction(() => {
    exec('DELETE FROM portion')
    exec('DELETE FROM ingredient')
    for (const i of payload.ingredients) {
      exec(
        `INSERT INTO ingredient VALUES (?,?,?,?,?,?,?,?,?)`,
        [i.id, i.nom, i.categorie, i.kcal, i.proteines, i.glucides, i.lipides, i.fibres, i.note ?? null],
      )
      for (const p of i.portions ?? []) {
        exec('INSERT INTO portion VALUES (?,?,?)', [i.id, p.label, p.g])
      }
    }
    exec(`INSERT INTO meta VALUES ('ingredients_version', ?)
          ON CONFLICT(cle) DO UPDATE SET valeur=excluded.valeur`, [payload.version])
  })
  return { seeded: true }
}

const ops: Record<string, (a: any) => any> = {
  async init(payload: { version: string; ingredients: any[] }) {
    graine = payload
    const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: console.error })
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'macros-pool' })
    ouvrirBase()
    return seed(payload)
  },

  ingredients: () =>
    exec(`SELECT i.*, (SELECT json_group_array(json_object('label', label, 'g', grammes))
                       FROM portion WHERE ingredient_id = i.id) AS portions_json
          FROM ingredient i ORDER BY i.categorie, i.nom`),

  jour: ({ jour }: { jour: string }) => ({
    lignes: exec('SELECT * FROM ligne WHERE jour = ? ORDER BY id', [jour]),
    objectif: exec(
      'SELECT * FROM objectif WHERE depuis <= ? ORDER BY depuis DESC LIMIT 1',
      [jour],
    )[0],
  }),

  ajouter: ({ jour, repas, ing, grammes }: any) => {
    const k = grammes / 100
    exec(
      `INSERT INTO ligne (jour, repas, ingredient_id, nom, grammes, kcal, proteines,
                          glucides, lipides, fibres, cree_le)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [jour, repas, ing.id, ing.nom, grammes, ing.kcal * k, ing.proteines * k,
       ing.glucides * k, ing.lipides * k, ing.fibres * k, new Date().toISOString()],
    )
    return { ok: true }
  },

  supprimer: ({ id }: { id: number }) => {
    exec('DELETE FROM ligne WHERE id = ?', [id])
    return { ok: true }
  },

  /** Recopie un repas d'un autre jour. Sans ça, tu tiens deux semaines. */
  copier: ({ depuis, vers, repas }: any) => {
    exec(
      `INSERT INTO ligne (jour, repas, ingredient_id, nom, grammes, kcal, proteines,
                          glucides, lipides, fibres, cree_le)
       SELECT ?, repas, ingredient_id, nom, grammes, kcal, proteines,
              glucides, lipides, fibres, ?
       FROM ligne WHERE jour = ? AND repas = ?`,
      [vers, new Date().toISOString(), depuis, repas],
    )
    return { copiees: db.changes() }
  },

  joursRecents: () =>
    exec(`SELECT jour, COUNT(*) n FROM ligne GROUP BY jour ORDER BY jour DESC LIMIT 30`),

  objectif: ({ depuis, kcal, proteines, glucides, lipides }: any) => {
    exec(
      `INSERT INTO objectif VALUES (?,?,?,?,?)
       ON CONFLICT(depuis) DO UPDATE SET kcal=excluded.kcal, proteines=excluded.proteines,
       glucides=excluded.glucides, lipides=excluded.lipides`,
      [depuis, kcal, proteines, glucides, lipides],
    )
    return { ok: true }
  },

  /** Le fichier .sqlite brut — à archiver, ou à ouvrir avec `sqlite3` sur le Mac. */
  exporter: () => pool.exportFile('/macros.sqlite'),

  /** Restaure un export. La table ingrédients est re-semée depuis le build courant :
      c'est le git qui fait foi pour les aliments, pas le fichier restauré. */
  importer: ({ octets }: { octets: Uint8Array }) => {
    db.close()
    try {
      pool.importDb('/macros.sqlite', octets)
    } catch (err) {
      ouvrirBase() // l'ancienne base est intacte : on la rouvre plutôt que de rester mort
      throw err
    }
    ouvrirBase()
    exec(`DELETE FROM meta WHERE cle='ingredients_version'`)
    return seed(graine)
  },
}

self.onmessage = async (e: MessageEvent) => {
  const { id, op, payload } = e.data
  try {
    const result = await ops[op](payload)
    self.postMessage({ id, result })
  } catch (err: any) {
    self.postMessage({ id, error: err?.message ?? String(err) })
  }
}
