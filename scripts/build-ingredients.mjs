#!/usr/bin/env node
/**
 * data/ingredients.yaml  ->  public/ingredients.json
 *
 * Valide avant d'écrire. Sort en code 1 si quelque chose cloche, ce qui fait
 * échouer le build et la CI. C'est tout l'intérêt : une base d'ingrédients
 * fausse est pire qu'une base vide, parce que tu lui fais confiance.
 *
 *   node scripts/build-ingredients.mjs           écrit public/ingredients.json
 *   node scripts/build-ingredients.mjs --check   valide sans rien écrire
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')

const ID_RE = /^[a-z0-9]+(_[a-z0-9]+)*$/
const REQUIS = ['id', 'nom', 'kcal', 'proteines', 'glucides', 'lipides']
const NOMBRES = ['kcal', 'proteines', 'glucides', 'lipides', 'fibres']

// Facteurs d'Atwater (règlement UE 1169/2011)
const K_PROT = 4, K_GLUC = 4, K_LIP = 9, K_FIB = 2

// Tolérance : 5 % en relatif, mais au moins 12 kcal en absolu. Sans le plancher,
// le brocoli à 35 kcal se ferait recaler pour un arrondi d'étiquette.
const TOL_REL = 0.05, TOL_ABS = 12

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v)

function valider(brut) {
  const erreurs = []
  const avertissements = []
  const vus = new Map()
  const sortie = []

  if (!Array.isArray(brut)) {
    erreurs.push('ingredients.yaml doit contenir une liste au premier niveau.')
    return { sortie, erreurs, avertissements }
  }

  brut.forEach((item, i) => {
    let tag = `[${i}]`
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      erreurs.push(`${tag} n'est pas un objet YAML.`)
      return
    }

    const manquants = REQUIS.filter((k) => item[k] === undefined || item[k] === null)
    if (manquants.length) {
      erreurs.push(`${tag} champs manquants : ${manquants.join(', ')}`)
      return
    }

    const id = String(item.id)
    tag = `[${id}]`

    if (!ID_RE.test(id)) {
      erreurs.push(`${tag} id invalide — attendu du snake_case ascii (ex. thon_naturel).`)
    }
    if (vus.has(id)) {
      erreurs.push(`${tag} id déjà utilisé à l'entrée [${vus.get(id)}].`)
    }
    vus.set(id, i)

    const ing = {
      id,
      nom: String(item.nom),
      categorie: String(item.categorie ?? 'autre'),
      note: item.note == null ? null : String(item.note),
    }

    let mauvaisNombre = false
    for (const cle of NOMBRES) {
      const val = item[cle] ?? 0
      if (!estNombre(val)) {
        erreurs.push(`${tag} champ « ${cle} » : nombre attendu, reçu ${JSON.stringify(val)}.`)
        mauvaisNombre = true
        continue
      }
      if (val < 0) {
        erreurs.push(`${tag} champ « ${cle} » négatif (${val}).`)
        mauvaisNombre = true
      }
      ing[cle] = val
    }
    if (mauvaisNombre) return

    // Un aliment ne peut pas contenir plus de 100 g de matière par 100 g.
    const masse = ing.proteines + ing.glucides + ing.lipides + ing.fibres
    if (masse > 100) {
      erreurs.push(
        `${tag} la somme P+G+L+fibres fait ${masse.toFixed(1)} g pour 100 g. ` +
          'Des valeurs par portion recopiées en valeurs pour 100 g ?',
      )
    }

    // Atwater — le filet qui attrape virgules décalées et « dont sucres ».
    const calc = K_PROT * ing.proteines + K_GLUC * ing.glucides + K_LIP * ing.lipides + K_FIB * ing.fibres
    const ecart = Math.abs(calc - ing.kcal)
    if (ecart > Math.max(TOL_REL * ing.kcal, TOL_ABS)) {
      erreurs.push(
        `${tag} kcal incohérent : étiquette ${ing.kcal.toFixed(0)}, ` +
          `calcul Atwater ${calc.toFixed(0)} (écart ${ecart.toFixed(0)} kcal). ` +
          'Vérifie la virgule, les glucides « dont sucres », et la base 100 g.',
      )
    } else if (ecart > Math.max(0.02 * ing.kcal, 5)) {
      avertissements.push(`${tag} écart Atwater de ${ecart.toFixed(0)} kcal — toléré, mais jette un œil.`)
    }

    ing.portions = []
    for (const p of item.portions ?? []) {
      if (p === null || typeof p !== 'object' || p.label === undefined || p.g === undefined) {
        erreurs.push(`${tag} portion malformée : ${JSON.stringify(p)} (attendu label + g).`)
        continue
      }
      if (!estNombre(p.g) || p.g <= 0) {
        erreurs.push(`${tag} portion « ${p.label} » : grammage invalide (${JSON.stringify(p.g)}).`)
        continue
      }
      ing.portions.push({ label: String(p.label), g: p.g })
    }

    sortie.push(ing)
  })

  return { sortie, erreurs, avertissements }
}

function main() {
  const check = process.argv.includes('--check')
  const src = join(RACINE, 'data', 'ingredients.yaml')

  let brut
  try {
    brut = parse(readFileSync(src, 'utf8')) ?? []
  } catch (err) {
    console.error(`\n  ERREUR  YAML illisible dans data/ingredients.yaml :\n  ${err.message}\n`)
    return 1
  }

  const { sortie, erreurs, avertissements } = valider(brut)

  for (const a of avertissements) console.log(`  avertissement  ${a}`)
  if (erreurs.length) {
    for (const e of erreurs) console.error(`  ERREUR  ${e}`)
    console.error(`\n  ${erreurs.length} problème(s) — build annulé.\n`)
    return 1
  }

  sortie.sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom, 'fr'))

  // Empreinte du contenu : l'app ne re-sème sa table ingrédients que si ça bouge.
  const empreinte = JSON.stringify(sortie)
  const version = createHash('sha256').update(empreinte).digest('hex').slice(0, 12)

  console.log(`  ${sortie.length} ingrédients validés — version ${version}`)
  if (check) return 0

  const dest = join(RACINE, 'public', 'ingredients.json')
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, JSON.stringify({ version, ingredients: sortie }, null, 2) + '\n', 'utf8')
  console.log('  -> public/ingredients.json')
  return 0
}

process.exit(main())
