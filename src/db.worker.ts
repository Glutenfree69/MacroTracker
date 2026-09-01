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

-- Un repas n'a pas de nom : il est identifié par son rang dans la journée, et
-- affiché « Repas 1 », « Repas 2 »… Rien n'impose combien il y en a.
-- 'ordre' sert seulement à trier ; il n'a pas besoin d'être contigu, le libellé
-- est recalculé à partir de la position, donc supprimer un repas renumérote
-- les suivants tout seul.
CREATE TABLE IF NOT EXISTS repas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jour TEXT NOT NULL,
  ordre INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_repas_jour ON repas(jour, ordre);

-- Une ligne = un aliment pesé dans un repas. Les macros sont figées ici en
-- valeur absolue au moment de la saisie : corriger un ingrédient en novembre
-- ne doit pas réécrire tes journées de mars.
CREATE TABLE IF NOT EXISTS ligne (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jour TEXT NOT NULL, repas_id INTEGER NOT NULL,
  ingredient_id TEXT NOT NULL, nom TEXT NOT NULL, grammes REAL NOT NULL,
  kcal REAL NOT NULL, proteines REAL NOT NULL, glucides REAL NOT NULL,
  lipides REAL NOT NULL, fibres REAL NOT NULL,
  cree_le TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);

-- Une pesée par jour, optionnelle. Pas d'historique de rectifications : on
-- écrase la valeur du jour, comme le reste de l'app ne juge pas et ne garde
-- qu'un instantané.
CREATE TABLE IF NOT EXISTS poids (jour TEXT PRIMARY KEY, kg REAL NOT NULL);
`

function exec(sql: string, bind: any[] = []) {
  return db.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' })
}

/**
 * v1 -> v2 : les repas étaient quatre cases fixes (`ligne.repas` = 'petit_dej'…),
 * ils sont maintenant des lignes de la table `repas`. On reconstruit `ligne`
 * plutôt que de traîner l'ancienne colonne NOT NULL, et on conserve les id
 * existants pour ne rien réécrire de l'historique.
 */
const RANG_V1 = `CASE l.repas WHEN 'petit_dej' THEN 1 WHEN 'dejeuner' THEN 2
                              WHEN 'diner' THEN 3 WHEN 'collation' THEN 4 ELSE 5 END`

function migrer() {
  const colonnes = exec(`PRAGMA table_info(ligne)`).map((c: any) => c.name)
  if (!colonnes.includes('repas')) return

  db.transaction(() => {
    exec(`INSERT INTO repas (jour, ordre)
          SELECT jour, rang FROM (SELECT DISTINCT l.jour AS jour, ${RANG_V1} AS rang FROM ligne l)`)
    exec(`CREATE TABLE ligne_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jour TEXT NOT NULL, repas_id INTEGER NOT NULL,
            ingredient_id TEXT NOT NULL, nom TEXT NOT NULL, grammes REAL NOT NULL,
            kcal REAL NOT NULL, proteines REAL NOT NULL, glucides REAL NOT NULL,
            lipides REAL NOT NULL, fibres REAL NOT NULL, cree_le TEXT NOT NULL)`)
    exec(`INSERT INTO ligne_v2
          SELECT l.id, l.jour, r.id, l.ingredient_id, l.nom, l.grammes, l.kcal,
                 l.proteines, l.glucides, l.lipides, l.fibres, l.cree_le
          FROM ligne l JOIN repas r ON r.jour = l.jour AND r.ordre = ${RANG_V1}`)
    exec(`DROP TABLE ligne`)
    exec(`ALTER TABLE ligne_v2 RENAME TO ligne`)
    exec(`DROP TABLE IF EXISTS objectif`) // plus d'objectifs : on totalise, on ne juge pas
  })
}

/** Ajoute la colonne des repas saisis à la main (Uber Eats…) si elle manque
    encore — SQLite autorise ADD COLUMN NOT NULL DEFAULT directement, pas
    besoin du rebuild façon migrer(). */
function migrerUberEats() {
  const colonnes = exec(`PRAGMA table_info(ligne)`).map((c: any) => c.name)
  if (colonnes.includes('uber_eats')) return
  exec(`ALTER TABLE ligne ADD COLUMN uber_eats INTEGER NOT NULL DEFAULT 0`)
}

function ouvrirBase() {
  db = new pool.OpfsSAHPoolDb('/macros.sqlite')
  db.exec(SCHEMA)
  migrer() // avant l'index : il porte sur une colonne que la v1 n'a pas
  migrerUberEats()
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ligne_jour ON ligne(jour, repas_id)`)
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

/** Crée un repas en queue de journée et rend son id. */
function creerRepas(jour: string): number {
  const [{ suivant }] = exec(
    'SELECT COALESCE(MAX(ordre), 0) + 1 AS suivant FROM repas WHERE jour = ?', [jour],
  )
  exec('INSERT INTO repas (jour, ordre) VALUES (?, ?)', [jour, suivant])
  return exec('SELECT last_insert_rowid() AS id')[0].id
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
    repas: exec('SELECT id, ordre FROM repas WHERE jour = ? ORDER BY ordre, id', [jour]),
    lignes: exec('SELECT * FROM ligne WHERE jour = ? ORDER BY id', [jour]),
    poids: exec('SELECT kg FROM poids WHERE jour = ?', [jour])[0]?.kg ?? null,
  }),

  /** kg=null efface la pesée du jour — c'est un champ facultatif. */
  definirPoids: ({ jour, kg }: { jour: string; kg: number | null }) => {
    if (kg === null) exec('DELETE FROM poids WHERE jour = ?', [jour])
    else exec(
      `INSERT INTO poids (jour, kg) VALUES (?, ?)
       ON CONFLICT(jour) DO UPDATE SET kg = excluded.kg`, [jour, kg],
    )
    return { ok: true }
  },

  creerRepas: ({ jour }: { jour: string }) => ({ id: creerRepas(jour) }),

  /** Supprime le repas et tout ce qu'il contenait — les suivants se renumérotent. */
  supprimerRepas: ({ id }: { id: number }) => {
    db.transaction(() => {
      exec('DELETE FROM ligne WHERE repas_id = ?', [id])
      exec('DELETE FROM repas WHERE id = ?', [id])
    })
    return { ok: true }
  },

  /** repas_id null = la journée n'a encore aucun repas, on crée le premier. */
  ajouter: ({ jour, repas_id, ing, grammes }: any) => {
    const k = grammes / 100
    const cible = repas_id ?? creerRepas(jour)
    exec(
      `INSERT INTO ligne (jour, repas_id, ingredient_id, nom, grammes, kcal, proteines,
                          glucides, lipides, fibres, cree_le)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [jour, cible, ing.id, ing.nom, grammes, ing.kcal * k, ing.proteines * k,
       ing.glucides * k, ing.lipides * k, ing.fibres * k, new Date().toISOString()],
    )
    return { repas_id: cible }
  },

  /** Macros tapées à la main : pas d'ingrédient réel, pas de pesée — l'étiquette
      est recopiée telle quelle. Deux appelants, un seul INSERT : le repas livré
      (uber_eats=1, qui se signale par 🛵 et sa pastille de calendrier) et
      l'aliment libre ajouté dans un repas ordinaire (uber_eats=0). */
  ajouterManuel: ({ jour, repas_id, nom, kcal, proteines, glucides, lipides,
                    fibres = 0, uber_eats = 0 }: any) => {
    const cible = repas_id ?? creerRepas(jour)
    // Sentinelles : ingredient_id est NOT NULL et ne pointe vers rien ici, mais
    // autant garder la trace de la provenance pour une analyse ultérieure.
    const sentinelle = uber_eats ? 'manuel' : 'libre'
    exec(
      `INSERT INTO ligne (jour, repas_id, ingredient_id, nom, grammes, kcal, proteines,
                          glucides, lipides, fibres, cree_le, uber_eats)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [jour, cible, sentinelle, nom, 0, kcal, proteines, glucides, lipides, fibres,
       new Date().toISOString(), uber_eats],
    )
    return { repas_id: cible }
  },

  supprimer: ({ id }: { id: number }) => {
    exec('DELETE FROM ligne WHERE id = ?', [id])
    return { ok: true }
  },

  /** Les repas d'une autre journée, avec de quoi les reconnaître dans la liste. */
  apercuJour: ({ jour }: { jour: string }) =>
    exec(
      `SELECT r.id, r.ordre,
              (SELECT COUNT(*) FROM ligne WHERE repas_id = r.id) AS n,
              (SELECT COALESCE(SUM(kcal), 0) FROM ligne WHERE repas_id = r.id) AS kcal,
              (SELECT group_concat(nom, ', ') FROM ligne WHERE repas_id = r.id) AS apercu
       FROM repas r WHERE r.jour = ? ORDER BY r.ordre, r.id`, [jour],
    ),

  /** Recopie un repas d'un autre jour, en fin de journée. Sans ça, on tient deux semaines. */
  copier: ({ repas_id, vers }: { repas_id: number; vers: string }) => {
    let copiees = 0
    db.transaction(() => {
      const cible = creerRepas(vers)
      exec(
        `INSERT INTO ligne (jour, repas_id, ingredient_id, nom, grammes, kcal, proteines,
                            glucides, lipides, fibres, cree_le)
         SELECT ?, ?, ingredient_id, nom, grammes, kcal, proteines,
                glucides, lipides, fibres, ?
         FROM ligne WHERE repas_id = ?`,
        [vers, cible, new Date().toISOString(), repas_id],
      )
      copiees = db.changes()
      if (!copiees) exec('DELETE FROM repas WHERE id = ?', [cible]) // pas de repas vide en cadeau
    })
    return { copiees }
  },

  /** Résumé jour par jour sur un intervalle — sert la grille du calendrier. */
  joursEntre: ({ debut, fin }: { debut: string; fin: string }) =>
    exec(
      `SELECT jour, COUNT(*) n, ROUND(SUM(kcal)) kcal, MAX(uber_eats) uber_eats FROM ligne
       WHERE jour BETWEEN ? AND ? GROUP BY jour`, [debut, fin],
    ),

  /** Repartir de zéro : vide le journal (repas, lignes, pesées). Les
      ingrédients ne bougent pas, ils viennent du build et non de la saisie. */
  reinitialiser: () => {
    db.transaction(() => {
      exec('DELETE FROM ligne')
      exec('DELETE FROM repas')
      exec('DELETE FROM poids')
      exec(`DELETE FROM sqlite_sequence WHERE name IN ('ligne', 'repas')`)
    })
    exec('VACUUM') // hors transaction : SQLite le refuse dedans
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
