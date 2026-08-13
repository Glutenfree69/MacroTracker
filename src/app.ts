import { call, demarrer } from './db'
import './style.css'

type Ing = {
  id: string; nom: string; categorie: string
  kcal: number; proteines: number; glucides: number; lipides: number; fibres: number
  note: string | null; portions_json: string | null
}
type Ligne = {
  id: number; jour: string; repas: string; nom: string; grammes: number
  kcal: number; proteines: number; glucides: number; lipides: number; fibres: number
}
type Objectif = { kcal: number; proteines: number; glucides: number; lipides: number }

/** Une seule modale ouverte à la fois — l'état de l'app tient dans ces variables. */
type Modale =
  | { type: 'recherche'; repas: string }
  | { type: 'quantite'; repas: string; ing: Ing }
  | { type: 'objectifs' }
  | { type: 'copier' }

const REPAS = [
  { cle: 'petit_dej', nom: 'Petit-déjeuner' },
  { cle: 'dejeuner', nom: 'Déjeuner' },
  { cle: 'diner', nom: 'Dîner' },
  { cle: 'collation', nom: 'Collation' },
]
const MACROS = [
  { cle: 'proteines', nom: 'Protéines', kcalParG: 4 },
  { cle: 'glucides', nom: 'Glucides', kcalParG: 4 },
  { cle: 'lipides', nom: 'Lipides', kcalParG: 9 },
] as const

const app = document.getElementById('app')!
const iso = (d: Date) => d.toLocaleDateString('sv-SE') // YYYY-MM-DD en heure locale
const r0 = (n: number) => Math.round(n).toString()
const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const dateFr = (j: string) =>
  new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

let jour = iso(new Date())
let ingredients: Ing[] = []
let lignes: Ligne[] = []
let objectif: Objectif = { kcal: 2400, proteines: 180, glucides: 250, lipides: 80 }
let modale: Modale | null = null

async function charger() {
  const d = await call<{ lignes: Ligne[]; objectif: Objectif }>('jour', { jour })
  lignes = d.lignes
  if (d.objectif) objectif = d.objectif
  dessiner()
}

function total(cle: 'kcal' | 'proteines' | 'glucides' | 'lipides' | 'fibres') {
  return lignes.reduce((s, l) => s + l[cle], 0)
}

function el(html: string) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild as HTMLElement
}

function ouvrir(m: Modale | null) {
  modale = m
  dessiner()
}

/* ── La barre du jour ──────────────────────────────────────────────
   Sa largeur, ce sont les kcal ; ses segments, d'où viennent ces kcal.
   Le cran vertical marque l'objectif. Une seule image pour la journée. */
function barre() {
  const kcal = total('kcal')
  const echelle = Math.max(objectif.kcal, kcal) * 1.04 || 1
  const segs = MACROS.map((m) => {
    const part = total(m.cle) * m.kcalParG
    return `<span class="seg seg--${m.cle}" style="width:${(part / echelle) * 100}%"
             title="${m.nom} : ${r0(part)} kcal"></span>`
  }).join('')
  const depasse = kcal > objectif.kcal

  return el(`
    <section class="jauge">
      <header class="jauge__tete">
        <div>
          <span class="chiffre chiffre--grand">${r0(kcal)}</span>
          <span class="unite">kcal</span>
        </div>
        <div class="reste ${depasse ? 'reste--depasse' : ''}">
          ${depasse ? `+${r0(kcal - objectif.kcal)} au-dessus` : `${r0(objectif.kcal - kcal)} restantes`}
        </div>
      </header>
      <div class="piste">
        ${segs}
        <span class="cran" style="left:${Math.min(100, (objectif.kcal / echelle) * 100)}%"></span>
      </div>
      <div class="macros">
        ${MACROS.map((m) => {
          const g = total(m.cle)
          const cible = objectif[m.cle] || 1
          return `<div class="macro">
            <div class="macro__tete">
              <span class="pastille pastille--${m.cle}"></span>${m.nom}
            </div>
            <div class="macro__val">
              <span class="chiffre">${r0(g)}</span><span class="unite">/${r0(cible)} g</span>
            </div>
            <div class="macro__piste">
              <span class="macro__jauge macro__jauge--${m.cle}"
                    style="width:${Math.min(100, (g / cible) * 100)}%"></span>
            </div>
          </div>`
        }).join('')}
      </div>
    </section>`)
}

function sectionRepas(repas: { cle: string; nom: string }) {
  const mes = lignes.filter((l) => l.repas === repas.cle)
  const kcal = mes.reduce((s, l) => s + l.kcal, 0)

  const node = el(`
    <section class="repas">
      <header class="repas__tete">
        <h2>${repas.nom}</h2>
        <span class="repas__kcal">${mes.length ? r0(kcal) + ' kcal' : ''}</span>
      </header>
      <ul class="lignes">
        ${mes.map((l) => `
          <li class="ligne">
            <span class="ligne__nom">${esc(l.nom)}</span>
            <span class="ligne__g chiffre">${r0(l.grammes)} g</span>
            <span class="ligne__kcal chiffre">${r0(l.kcal)}</span>
            <button class="retirer" data-id="${l.id}" aria-label="Retirer ${esc(l.nom)}">×</button>
          </li>`).join('')}
      </ul>
      <button class="ajouter" data-repas="${repas.cle}">+ Ajouter un aliment</button>
    </section>`)

  node.querySelectorAll<HTMLButtonElement>('.retirer').forEach((b) => {
    b.onclick = async () => {
      await call('supprimer', { id: Number(b.dataset.id) })
      charger()
    }
  })
  node.querySelector<HTMLButtonElement>('.ajouter')!.onclick = () =>
    ouvrir({ type: 'recherche', repas: repas.cle })
  return node
}

/* ── Modales ─────────────────────────────────────────────────────── */

function feuille(corps: string, titre: string) {
  const node = el(`
    <div class="voile">
      <div class="feuille" role="dialog" aria-modal="true" aria-label="${esc(titre)}">${corps}</div>
    </div>`)
  node.onclick = (e) => { if (e.target === node) ouvrir(null) }
  node.querySelector<HTMLButtonElement>('[data-fermer]')?.addEventListener('click', () => ouvrir(null))
  return node
}

function panneauRecherche(repas: string) {
  const node = feuille(`
    <header class="feuille__tete">
      <h2>Choisir un aliment</h2>
      <button data-fermer aria-label="Fermer">×</button>
    </header>
    <input class="recherche" type="search" placeholder="Filtrer…" autocomplete="off" spellcheck="false">
    <ul class="resultats"></ul>`, 'Ajouter un aliment')

  const champ = node.querySelector<HTMLInputElement>('.recherche')!
  const liste = node.querySelector<HTMLUListElement>('.resultats')!
  let visibles: Ing[] = []

  const filtrer = () => {
    const q = champ.value.trim().toLowerCase()
    visibles = ingredients
      .filter((i) => !q || i.nom.toLowerCase().includes(q) || i.categorie.toLowerCase().includes(q))
      .slice(0, 50)

    let categorie = ''
    liste.innerHTML = visibles.length
      ? visibles.map((i) => {
          const tete = i.categorie === categorie ? '' : `<li class="categorie">${esc(categorie = i.categorie)}</li>`
          return `${tete}<li><button data-id="${esc(i.id)}">
            <span>${esc(i.nom)}</span>
            <span class="apercu chiffre">${r0(i.kcal)} kcal · ${i.proteines.toFixed(1)} P</span>
          </button></li>`
        }).join('')
      : `<li class="vide">Rien ne correspond.<br>Ajoute-le dans <code>data/ingredients.yaml</code>, pousse, et recharge.</li>`

    liste.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => choisir(ingredients.find((i) => i.id === b.dataset.id)!)
    })
  }
  const choisir = (ing: Ing) => ouvrir({ type: 'quantite', repas, ing })

  champ.oninput = filtrer
  champ.onkeydown = (e) => { if (e.key === 'Enter' && visibles.length) choisir(visibles[0]) }
  filtrer()
  setTimeout(() => champ.focus(), 30)
  return node
}

function panneauQuantite(repas: string, ing: Ing) {
  const portions: { label: string; g: number }[] = JSON.parse(ing.portions_json || '[]')

  const node = feuille(`
    <header class="feuille__tete">
      <button data-retour aria-label="Revenir à la liste">‹</button>
      <h2>${esc(ing.nom)}</h2>
      <button data-fermer aria-label="Fermer">×</button>
    </header>
    ${ing.note ? `<p class="note">${esc(ing.note)}</p>` : ''}
    <div class="pese">
      <input class="quantite" type="number" inputmode="decimal" value="100" min="0" step="1">
      <span class="unite">g</span>
    </div>
    ${portions.length ? `<div class="portions">${portions.map((p) =>
      `<button class="portion" data-g="${p.g}">${esc(p.label)} · ${r0(p.g)} g</button>`).join('')}</div>` : ''}
    <div class="calcul"></div>
    <button class="valider">Ajouter au repas</button>`, `Peser ${ing.nom}`)

  const champ = node.querySelector<HTMLInputElement>('.quantite')!
  const apercu = node.querySelector<HTMLDivElement>('.calcul')!

  const rafraichir = () => {
    const k = (parseFloat(champ.value) || 0) / 100
    apercu.innerHTML = MACROS.map((m) =>
      `<span><span class="pastille pastille--${m.cle}"></span>${(ing[m.cle] * k).toFixed(1)} g</span>`
    ).join('') + `<strong class="chiffre">${r0(ing.kcal * k)} kcal</strong>`
  }
  const valider = async () => {
    const grammes = parseFloat(champ.value)
    if (!(grammes > 0)) return
    await call('ajouter', { jour, repas, ing, grammes })
    modale = null
    charger()
  }

  champ.oninput = rafraichir
  champ.onkeydown = (e) => { if (e.key === 'Enter') valider() }
  rafraichir()
  setTimeout(() => { champ.focus(); champ.select() }, 30)

  node.querySelectorAll<HTMLButtonElement>('.portion').forEach((b) => {
    b.onclick = () => { champ.value = b.dataset.g!; rafraichir(); champ.focus() }
  })
  node.querySelector<HTMLButtonElement>('.valider')!.onclick = valider
  node.querySelector<HTMLButtonElement>('[data-retour]')!.onclick = () =>
    ouvrir({ type: 'recherche', repas })
  return node
}

/** Les objectifs sont datés : on écrit une nouvelle ligne valable à partir du
    jour affiché, ce qui laisse les journées passées telles qu'elles étaient. */
function panneauObjectifs() {
  const champs = [
    { cle: 'kcal', nom: 'Calories', unite: 'kcal' },
    { cle: 'proteines', nom: 'Protéines', unite: 'g' },
    { cle: 'glucides', nom: 'Glucides', unite: 'g' },
    { cle: 'lipides', nom: 'Lipides', unite: 'g' },
  ] as const

  const node = feuille(`
    <header class="feuille__tete">
      <h2>Objectifs journaliers</h2>
      <button data-fermer aria-label="Fermer">×</button>
    </header>
    <p class="note">Appliqués à partir du ${esc(dateFr(jour))}. Les journées antérieures gardent
       les objectifs qu'elles avaient — l'historique n'est pas réécrit.</p>
    <div class="reglages">
      ${champs.map((c) => `
        <label class="reglage">
          <span>${c.nom}</span>
          <span class="reglage__saisie">
            <input type="number" min="0" step="1" data-cle="${c.cle}" value="${r0(objectif[c.cle])}">
            <span class="unite">${c.unite}</span>
          </span>
        </label>`).join('')}
    </div>
    <div class="calcul"><span data-atwater></span></div>
    <button class="valider">Enregistrer</button>`, 'Objectifs journaliers')

  const entrees = [...node.querySelectorAll<HTMLInputElement>('input[data-cle]')]
  const lu = () => Object.fromEntries(
    entrees.map((i) => [i.dataset.cle, Math.max(0, parseFloat(i.value) || 0)]),
  ) as unknown as Objectif

  // Un garde-fou, pas une contrainte : on affiche l'écart, on ne l'impose pas.
  const atwater = node.querySelector<HTMLSpanElement>('[data-atwater]')!
  const rafraichir = () => {
    const o = lu()
    const somme = 4 * o.proteines + 4 * o.glucides + 9 * o.lipides
    const ecart = somme - o.kcal
    atwater.textContent = Math.abs(ecart) < 25
      ? `P/G/L ≈ ${r0(somme)} kcal — cohérent`
      : `P/G/L = ${r0(somme)} kcal, soit ${ecart > 0 ? '+' : ''}${r0(ecart)} vs la cible calories`
    atwater.className = Math.abs(ecart) < 25 ? '' : 'ecart'
  }
  entrees.forEach((i) => { i.oninput = rafraichir })
  rafraichir()
  setTimeout(() => entrees[0].focus(), 30)

  node.querySelector<HTMLButtonElement>('.valider')!.onclick = async () => {
    await call('objectif', { depuis: jour, ...lu() })
    modale = null
    charger()
  }
  return node
}

/** Recopier un repas d'un autre jour. Sans ça, on tient deux semaines. */
function panneauCopier() {
  const veille = new Date(jour + 'T12:00:00')
  veille.setDate(veille.getDate() - 1)

  const node = feuille(`
    <header class="feuille__tete">
      <h2>Recopier un repas</h2>
      <button data-fermer aria-label="Fermer">×</button>
    </header>
    <div class="reglages">
      <label class="reglage">
        <span>Depuis le jour</span>
        <span class="reglage__saisie"><input type="date" data-depuis value="${iso(veille)}" max="${jour}"></span>
      </label>
    </div>
    <p class="note">Vers le ${esc(dateFr(jour))}. Quel repas ?</p>
    <div class="portions">
      ${REPAS.map((r) => `<button class="portion" data-repas="${r.cle}">${r.nom}</button>`).join('')}
    </div>
    <p class="note" data-retour-info></p>`, 'Recopier un repas')

  const depuis = node.querySelector<HTMLInputElement>('[data-depuis]')!
  const info = node.querySelector<HTMLParagraphElement>('[data-retour-info]')!

  node.querySelectorAll<HTMLButtonElement>('.portion').forEach((b) => {
    b.onclick = async () => {
      const { copiees } = await call<{ copiees: number }>('copier', {
        depuis: depuis.value, vers: jour, repas: b.dataset.repas,
      })
      if (!copiees) {
        info.textContent = `Rien à recopier : ce repas était vide le ${dateFr(depuis.value)}.`
        return
      }
      modale = null
      charger()
    }
  })
  return node
}

function panneau() {
  if (!modale) return null
  switch (modale.type) {
    case 'recherche': return panneauRecherche(modale.repas)
    case 'quantite': return panneauQuantite(modale.repas, modale.ing)
    case 'objectifs': return panneauObjectifs()
    case 'copier': return panneauCopier()
  }
}

/* ── Chrome ──────────────────────────────────────────────────────── */

function glisserJour(n: number) {
  const d = new Date(jour + 'T12:00:00')
  d.setDate(d.getDate() + n)
  if (n > 0 && d > new Date()) return // pas de repas dans le futur
  jour = iso(d)
  charger()
}

function enTete() {
  const d = new Date(jour + 'T12:00:00')
  const aujourdhui = jour === iso(new Date())
  const node = el(`
    <header class="bandeau">
      <button data-dec aria-label="Jour précédent" title="Jour précédent (←)">‹</button>
      <button class="bandeau__date" data-aujourdhui ${aujourdhui ? 'disabled' : ''}
              title="Revenir à aujourd'hui">
        <strong>${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
        <span>${aujourdhui ? "aujourd'hui" : d.getFullYear()}</span>
      </button>
      <button data-inc aria-label="Jour suivant" title="Jour suivant (→)" ${aujourdhui ? 'disabled' : ''}>›</button>
    </header>`)
  node.querySelector<HTMLButtonElement>('[data-dec]')!.onclick = () => glisserJour(-1)
  node.querySelector<HTMLButtonElement>('[data-inc]')!.onclick = () => glisserJour(1)
  node.querySelector<HTMLButtonElement>('[data-aujourdhui]')!.onclick = () => {
    jour = iso(new Date())
    charger()
  }
  return node
}

function pied() {
  const node = el(`
    <footer class="pied">
      <button data-objectifs>Objectifs</button>
      <button data-copier>Recopier un repas</button>
      <button data-export>Exporter</button>
      <button data-import>Restaurer</button>
      <input type="file" accept=".sqlite,.db" hidden data-fichier>
    </footer>`)

  node.querySelector<HTMLButtonElement>('[data-objectifs]')!.onclick = () => ouvrir({ type: 'objectifs' })
  node.querySelector<HTMLButtonElement>('[data-copier]')!.onclick = () => ouvrir({ type: 'copier' })

  node.querySelector<HTMLButtonElement>('[data-export]')!.onclick = async () => {
    const octets = await call<Uint8Array>('exporter')
    const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: 'application/vnd.sqlite3' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `macros-${jour}.sqlite` })
    a.click()
    URL.revokeObjectURL(url)
  }

  // L'export sans restauration serait un piège : la base ne vit que dans ce
  // navigateur, et OPFS peut être évincé.
  const fichier = node.querySelector<HTMLInputElement>('[data-fichier]')!
  node.querySelector<HTMLButtonElement>('[data-import]')!.onclick = () => fichier.click()
  fichier.onchange = async () => {
    const f = fichier.files?.[0]
    if (!f) return
    if (confirm(`Remplacer toute la base locale par ${f.name} ? Les repas actuels seront perdus.`)) {
      try {
        await call('importer', { octets: new Uint8Array(await f.arrayBuffer()) })
        ingredients = await call<Ing[]>('ingredients')
        await charger()
      } catch (err: any) {
        alert(`Restauration impossible : ${err?.message ?? err}\nLa base actuelle est intacte.`)
      }
    }
    fichier.value = '' // sinon re-choisir le même fichier ne déclenche rien
  }
  return node
}

function dessiner() {
  const p = panneau()
  app.replaceChildren(
    enTete(),
    barre(),
    ...REPAS.map(sectionRepas),
    pied(),
    ...(p ? [p] : []),
  )
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modale) { ouvrir(null); return }
  if (modale || e.metaKey || e.ctrlKey || e.altKey) return
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return
  if (e.key === 'ArrowLeft') glisserJour(-1)
  if (e.key === 'ArrowRight') glisserJour(1)
})

;(async () => {
  try {
    await demarrer()
    ingredients = await call<Ing[]>('ingredients')
    await navigator.storage?.persist?.()
    await charger()
  } catch (err: any) {
    app.innerHTML = `<div class="panne">
      <h2>La base n'a pas pu s'ouvrir</h2>
      <p>${esc(err?.message ?? err)}</p>
      <p>Cette app stocke tes repas dans le navigateur (OPFS). Une fenêtre privée
         ou un navigateur trop ancien bloque ce stockage : réessaie dans un onglet
         normal, sur une version récente de Chrome, Firefox ou Safari.</p>
    </div>`
  }
})()
