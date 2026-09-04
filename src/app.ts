import { call, demarrer, surModification } from './db'
import {
  connecter, deconnecter, etatDrive, initialiserDrive, planifierSync, surChangementEtat, surImportDistant,
} from './drive'
import './style.css'

type Ing = {
  id: string; nom: string; categorie: string
  kcal: number; proteines: number; glucides: number; lipides: number; fibres: number
  note: string | null; portions_json: string | null
}
type Ligne = {
  id: number; jour: string; repas_id: number; nom: string; grammes: number
  kcal: number; proteines: number; glucides: number; lipides: number; fibres: number
  uber_eats: number
}
type Repas = { id: number; ordre: number }
type Apercu = { id: number; ordre: number; n: number; kcal: number; apercu: string | null }

/** Une seule modale ouverte à la fois — l'état de l'app tient dans ces variables. */
type Modale =
  | { type: 'recherche'; repas: number | null }
  | { type: 'quantite'; repas: number | null; ing: Ing }
  | { type: 'manuel'; repas: number | null }
  | { type: 'libre'; repas: number | null; nom: string }
  | { type: 'copier' }

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
/** Accents et casse gommés des deux côtés de la comparaison : « poelee » doit
    trouver « Poêlée », et « pâtes » trouver « Pates ». Les noms de la base sont
    eux-mêmes inconstants en accentuation, la requête ne peut pas être seule à
    faire l'effort. */
const sansAccent = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const dateFr = (j: string) =>
  new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const depuisTexte = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  return `il y a ${Math.round(min / 60)} h`
}
const texteEtatDrive = (etat: ReturnType<typeof etatDrive>) =>
  etat.reconnexionRequise ? 'reconnexion nécessaire'
  : etat.erreur ? 'erreur de synchro'
  : etat.enAttente ? 'en attente…'
  : etat.dernierSyncLe ? `synchronisé ${depuisTexte(etat.dernierSyncLe)}`
  : 'connecté'

const doux = matchMedia('(prefers-reduced-motion: reduce)').matches

let jour = iso(new Date())
let ingredients: Ing[] = []
// Nom + catégorie normalisés, calculés une fois par chargement plutôt qu'à
// chaque frappe. Clé = ingredient.id.
let indexRecherche = new Map<string, string>()
let lignes: Ligne[] = []
let repasDuJour: Repas[] = []
let poidsDuJour: number | null = null
let modale: Modale | null = null

type JourActif = { n: number; kcal: number; uberEats: boolean }
let moisAffiche = jour.slice(0, 7) // 'YYYY-MM'
let joursActifsMois = new Map<string, JourActif>()

// D'où repartent les animations : la couronne et le compteur glissent de l'état
// précédent vers le nouveau au lieu de sauter. Remis à zéro quand on change de
// jour, pour que la journée se dessine.
let precedent = { kcal: 0, arcs: [0, 0, 0] }
let animerLignes = true

async function charger() {
  const d = await call<{ lignes: Ligne[]; repas: Repas[]; poids: number | null }>('jour', { jour })
  lignes = d.lignes
  repasDuJour = d.repas
  poidsDuJour = d.poids
  dessiner()
}

/** Remplace la base locale par ces octets (restauration manuelle ou pull Drive). */
async function appliquerRestauration(octets: Uint8Array) {
  await call('importer', { octets })
  poserIngredients(await call<Ing[]>('ingredients'))
  precedent = { kcal: 0, arcs: [0, 0, 0] }
  animerLignes = true
  await charger()
}

/** Seul point d'entrée pour poser la liste d'ingrédients : l'index suit. */
function poserIngredients(liste: Ing[]) {
  ingredients = liste
  indexRecherche = new Map(liste.map((i) => [i.id, sansAccent(`${i.nom} ${i.categorie}`)]))
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

/** Compteur qui monte — easing cubique, et rien du tout si l'OS demande du calme. */
function animerNombre(cible: HTMLElement, de: number, vers: number) {
  if (doux || de === vers) { cible.textContent = r0(vers); return }
  const debut = performance.now()
  const duree = 550
  const pas = (t: number) => {
    const p = Math.min(1, (t - debut) / duree)
    const e = 1 - Math.pow(1 - p, 3)
    cible.textContent = r0(de + (vers - de) * e)
    if (p < 1) requestAnimationFrame(pas)
  }
  requestAnimationFrame(pas)
}

/* ── La couronne du jour ───────────────────────────────────────────
   Plus d'objectif : rien à « atteindre », donc rien à jauger. Ce qui reste
   intéressant, c'est la composition — d'où un anneau de répartition plutôt
   qu'une barre de progression. */
const RAYON = 54
const CIRCONF = 2 * Math.PI * RAYON
const ECART = 5 // petit blanc entre deux segments

function couronne() {
  const kcal = total('kcal')
  const parts = MACROS.map((m) => total(m.cle) * m.kcalParG)
  const somme = parts.reduce((a, b) => a + b, 0)
  // Les arcs suivent les kcal reconstituées (4/4/9) et non les kcal d'étiquette :
  // c'est la seule façon d'avoir un anneau qui boucle exactement.
  const arcs = somme ? parts.map((p) => (p / somme) * CIRCONF) : [0, 0, 0]

  let depart = 0
  const departs = arcs.map((a) => { const d = depart; depart += a; return d })

  const node = el(`
    <section class="jour ${somme ? '' : 'jour--vide'}">
      <div class="couronne">
        <svg viewBox="0 0 128 128" aria-hidden="true">
          <circle class="arc arc--fond" cx="64" cy="64" r="${RAYON}"></circle>
          ${MACROS.map((m, i) => `
            <circle class="arc arc--${m.cle}" cx="64" cy="64" r="${RAYON}"
                    data-arc="${i}" data-depart="${departs[i]}"></circle>`).join('')}
        </svg>
        <div class="couronne__centre">
          <span class="chiffre chiffre--grand" data-kcal>0</span>
          <span class="unite">kcal</span>
        </div>
      </div>

      <ul class="repartition">
        ${MACROS.map((m, i) => `
          <li>
            <span class="pastille pastille--${m.cle}"></span>
            <span class="repartition__nom">${m.nom}</span>
            <span class="repartition__g chiffre">${r0(total(m.cle))} g</span>
            <span class="repartition__pc chiffre">${somme ? r0((parts[i] / somme) * 100) + ' %' : '—'}</span>
          </li>`).join('')}
        ${total('fibres') > 0 ? `
          <li class="repartition--discret">
            <span class="pastille pastille--fibres"></span>
            <span class="repartition__nom">Fibres</span>
            <span class="repartition__g chiffre">${r0(total('fibres'))} g</span>
            <span class="repartition__pc"></span>
          </li>` : ''}
      </ul>
    </section>`)

  // Départ = état précédent, puis on laisse la transition CSS faire le trajet.
  const cercles = [...node.querySelectorAll<SVGCircleElement>('[data-arc]')]
  const poser = (valeurs: number[]) => {
    let d = 0
    cercles.forEach((c, i) => {
      const visible = Math.max(0, valeurs[i] - ECART)
      c.style.strokeDasharray = `${visible} ${CIRCONF - visible}`
      c.style.strokeDashoffset = `${-(d + ECART / 2)}`
      d += valeurs[i]
    })
  }
  poser(doux ? arcs : precedent.arcs)
  if (!doux) requestAnimationFrame(() => requestAnimationFrame(() => poser(arcs)))

  animerNombre(node.querySelector<HTMLElement>('[data-kcal]')!, precedent.kcal, kcal)
  precedent = { kcal, arcs }
  return node
}

/* ── Repas ────────────────────────────────────────────────────────── */

function sectionRepas(r: Repas | { id: null; ordre: number }, rang: number) {
  const mes = r.id === null ? [] : lignes.filter((l) => l.repas_id === r.id)
  const kcal = mes.reduce((s, l) => s + l.kcal, 0)

  const node = el(`
    <section class="repas ${animerLignes ? 'repas--entre' : ''}" style="--rang:${rang}">
      <header class="repas__tete">
        <h2>Repas ${rang + 1}</h2>
        ${mes.length ? `<span class="repas__kcal chiffre">${r0(kcal)} kcal</span>` : ''}
        ${r.id === null ? '' : `<button class="repas__suppr" data-suppr aria-label="Supprimer le repas ${rang + 1}">×</button>`}
      </header>
      <ul class="lignes">
        ${mes.map((l, i) => `
          <li class="ligne" style="--rang:${i}">
            <button class="ligne__nom" data-detail aria-expanded="false">
              ${esc(l.nom)}<span class="ligne__fleche" aria-hidden="true">⌄</span>
            </button>
            <span class="ligne__g chiffre">${l.uber_eats ? '🛵' : l.grammes ? `${r0(l.grammes)} g` : '✎'}</span>
            <span class="ligne__kcal chiffre">${r0(l.kcal)}</span>
            <button class="retirer" data-id="${l.id}" aria-label="Retirer ${esc(l.nom)}">×</button>
            <ul class="ligne__macros">
              <li><span class="pastille pastille--proteines"></span>Protéines <span class="chiffre">${l.proteines.toFixed(1)} g</span></li>
              <li><span class="pastille pastille--glucides"></span>Glucides <span class="chiffre">${l.glucides.toFixed(1)} g</span></li>
              <li><span class="pastille pastille--lipides"></span>Lipides <span class="chiffre">${l.lipides.toFixed(1)} g</span></li>
              <li><span class="pastille pastille--fibres"></span>Fibres <span class="chiffre">${l.fibres.toFixed(1)} g</span></li>
            </ul>
          </li>`).join('')}
      </ul>
      <button class="ajouter">+ Ajouter un aliment</button>
    </section>`)

  node.querySelectorAll<HTMLButtonElement>('.retirer').forEach((b) => {
    b.onclick = async () => {
      animerLignes = false
      await call('supprimer', { id: Number(b.dataset.id) })
      charger()
    }
  })
  node.querySelectorAll<HTMLButtonElement>('[data-detail]').forEach((b) => {
    b.onclick = () => {
      const ouvert = b.closest('.ligne')!.classList.toggle('ligne--ouverte')
      b.setAttribute('aria-expanded', String(ouvert))
    }
  })
  node.querySelector<HTMLButtonElement>('.ajouter')!.onclick = () =>
    ouvrir({ type: 'recherche', repas: r.id })
  node.querySelector<HTMLButtonElement>('[data-suppr]')?.addEventListener('click', async () => {
    if (mes.length && !confirm(`Supprimer le repas ${rang + 1} et ses ${mes.length} aliment(s) ?`)) return
    animerLignes = false
    await call('supprimerRepas', { id: r.id })
    charger()
  })
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

function panneauRecherche(repas: number | null) {
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
    const q = sansAccent(champ.value.trim())
    visibles = ingredients
      .filter((i) => !q || indexRecherche.get(i.id)!.includes(q))
      .slice(0, 50)

    let categorie = ''
    // La ligne de création reste en queue de liste quoi qu'il arrive : un aliment
    // absent de la base ne doit pas être un cul-de-sac, que la recherche ait
    // donné quelque chose ou non.
    const requete = champ.value.trim()
    liste.innerHTML = (visibles.length
      ? visibles.map((i) => {
          const tete = i.categorie === categorie ? '' : `<li class="categorie">${esc(categorie = i.categorie)}</li>`
          return `${tete}<li><button data-id="${esc(i.id)}">
            <span>${esc(i.nom)}</span>
            <span class="apercu chiffre">${r0(i.kcal)} kcal · ${i.proteines.toFixed(1)} P</span>
          </button></li>`
        }).join('')
      : `<li class="vide">Rien ne correspond.</li>`)
      + `<li class="creer"><button data-creer>+ Aliment libre${
          requete ? ` « ${esc(requete)} »` : ''}</button></li>`

    liste.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach((b) => {
      b.onclick = () => choisir(ingredients.find((i) => i.id === b.dataset.id)!)
    })
    liste.querySelector<HTMLButtonElement>('[data-creer]')!.onclick = creerLibre
  }
  const choisir = (ing: Ing) => ouvrir({ type: 'quantite', repas, ing })
  const creerLibre = () => ouvrir({ type: 'libre', repas, nom: champ.value.trim() })

  champ.oninput = filtrer
  champ.onkeydown = (e) => {
    if (e.key !== 'Enter') return
    visibles.length ? choisir(visibles[0]) : creerLibre()
  }
  filtrer()
  setTimeout(() => champ.focus(), 30)
  return node
}

function panneauQuantite(repas: number | null, ing: Ing) {
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
    modale = null
    animerLignes = false
    await call('ajouter', { jour, repas_id: repas, ing, grammes })
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

/** Aliment absent de la base, tapé sur le moment : on recopie les totaux lus
    sur une étiquette ou une appli, sans pesée et sans rien mémoriser. Le
    grammage reste à 0 — c'est ce qui distingue la ligne à l'affichage. */
function panneauLibre(repas: number | null, nomInitial: string) {
  const node = feuille(`
    <header class="feuille__tete">
      <button data-retour aria-label="Revenir à la liste">‹</button>
      <h2>Aliment libre</h2>
      <button data-fermer aria-label="Fermer">×</button>
    </header>
    <div class="manuel">
      <input class="manuel__nom" type="text" placeholder="Nom de l'aliment" autocomplete="off"
             value="${esc(nomInitial)}">
      <label class="manuel__champ"><span>Kcal</span>
        <input type="number" inputmode="decimal" min="0" step="1" data-kcal></label>
      <label class="manuel__champ"><span>Protéines (g)</span>
        <input type="number" inputmode="decimal" min="0" step="0.1" data-proteines></label>
      <label class="manuel__champ"><span>Glucides (g)</span>
        <input type="number" inputmode="decimal" min="0" step="0.1" data-glucides></label>
      <label class="manuel__champ"><span>Lipides (g)</span>
        <input type="number" inputmode="decimal" min="0" step="0.1" data-lipides></label>
      <label class="manuel__champ"><span>Fibres (g)</span>
        <input type="number" inputmode="decimal" min="0" step="0.1" data-fibres></label>
    </div>
    <div class="calcul"></div>
    <button class="valider">Ajouter au repas</button>`, 'Aliment libre')

  const nom = node.querySelector<HTMLInputElement>('.manuel__nom')!
  const apercu = node.querySelector<HTMLDivElement>('.calcul')!
  const champ = (cle: string) => node.querySelector<HTMLInputElement>(`[data-${cle}]`)!
  const lire = (cle: string) => parseFloat(champ(cle).value) || 0

  // Rien à calculer, contrairement à la pesée : juste l'écho de ce qui est tapé,
  // pour se relire avant de valider.
  const rafraichir = () => {
    apercu.innerHTML = MACROS.map((m) =>
      `<span><span class="pastille pastille--${m.cle}"></span>${lire(m.cle).toFixed(1)} g</span>`
    ).join('') + `<strong class="chiffre">${r0(lire('kcal'))} kcal</strong>`
  }

  const valider = async () => {
    const titre = nom.value.trim()
    const k = parseFloat(champ('kcal').value) // pas lire() : un champ vide doit bloquer
    if (!titre || !(k >= 0)) return
    modale = null
    animerLignes = false
    await call('ajouterManuel', {
      jour, repas_id: repas, nom: titre, kcal: k,
      proteines: lire('proteines'), glucides: lire('glucides'),
      lipides: lire('lipides'), fibres: lire('fibres'),
    })
    charger()
  }

  node.querySelectorAll<HTMLInputElement>('input').forEach((i) => {
    i.oninput = rafraichir
    i.onkeydown = (e) => { if (e.key === 'Enter') valider() }
  })
  rafraichir()
  setTimeout(() => { nom.focus(); nom.select() }, 30)
  node.querySelector<HTMLButtonElement>('.valider')!.onclick = valider
  node.querySelector<HTMLButtonElement>('[data-retour]')!.onclick = () =>
    ouvrir({ type: 'recherche', repas })
  return node
}

/** Repas saisi à la main (Uber Eats…) : pas de recherche, pas de pesée — les
    macros sont recopiées telles quelles depuis l'appli de livraison. */
function panneauManuel(repas: number | null) {
  const node = feuille(`
    <header class="feuille__tete">
      <h2>Repas Uber Eats</h2>
      <button data-fermer aria-label="Fermer">×</button>
    </header>
    <div class="manuel">
      <input class="manuel__nom" type="text" placeholder="Nom du repas" autocomplete="off">
      <label class="manuel__champ"><span>Kcal</span>
        <input type="number" inputmode="decimal" min="0" step="1" data-kcal></label>
      <label class="manuel__champ"><span>Protéines (g)</span>
        <input type="number" inputmode="decimal" min="0" step="0.1" data-proteines></label>
      <label class="manuel__champ"><span>Glucides (g)</span>
        <input type="number" inputmode="decimal" min="0" step="0.1" data-glucides></label>
      <label class="manuel__champ"><span>Lipides (g)</span>
        <input type="number" inputmode="decimal" min="0" step="0.1" data-lipides></label>
    </div>
    <button class="valider">Ajouter le repas</button>`, 'Repas Uber Eats')

  const nom = node.querySelector<HTMLInputElement>('.manuel__nom')!
  const kcal = node.querySelector<HTMLInputElement>('[data-kcal]')!
  const proteines = node.querySelector<HTMLInputElement>('[data-proteines]')!
  const glucides = node.querySelector<HTMLInputElement>('[data-glucides]')!
  const lipides = node.querySelector<HTMLInputElement>('[data-lipides]')!

  const valider = async () => {
    const titre = nom.value.trim()
    const k = parseFloat(kcal.value)
    if (!titre || !(k >= 0)) return
    modale = null
    animerLignes = false
    await call('ajouterManuel', {
      jour, repas_id: repas, nom: titre, kcal: k,
      proteines: parseFloat(proteines.value) || 0,
      glucides: parseFloat(glucides.value) || 0,
      lipides: parseFloat(lipides.value) || 0,
      uber_eats: 1,
    })
    charger()
  }
  nom.onkeydown = (e) => { if (e.key === 'Enter') valider() }
  setTimeout(() => nom.focus(), 30)
  node.querySelector<HTMLButtonElement>('.valider')!.onclick = valider
  return node
}

/** Recopier un repas d'un autre jour. Sans ça, on tient deux semaines. */
function panneauCopier() {
  const node = feuille(`
    <header class="feuille__tete">
      <h2>Recopier un repas</h2>
      <button data-fermer aria-label="Fermer">×</button>
    </header>
    <div class="reglages">
      <label class="reglage">
        <span>Depuis le jour</span>
        <span class="reglage__saisie"><input type="date" data-depuis value="${jour}" max="${jour}"></span>
      </label>
    </div>
    <ul class="resultats" data-liste></ul>`, 'Recopier un repas')

  const depuis = node.querySelector<HTMLInputElement>('[data-depuis]')!
  const liste = node.querySelector<HTMLUListElement>('[data-liste]')!

  const rafraichir = async () => {
    const repas = await call<Apercu[]>('apercuJour', { jour: depuis.value })
    const pleins = repas.filter((r) => r.n > 0)
    liste.innerHTML = pleins.length
      ? pleins.map((r, i) => `<li><button data-id="${r.id}">
            <span>Repas ${i + 1}<br><small class="apercu">${esc(r.apercu ?? '')}</small></span>
            <span class="apercu chiffre">${r0(r.kcal)} kcal</span>
          </button></li>`).join('')
      : `<li class="vide">Aucun repas le ${esc(dateFr(depuis.value))}.</li>`

    liste.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = async () => {
        modale = null
        animerLignes = false
        await call('copier', { repas_id: Number(b.dataset.id), vers: jour })
        charger()
      }
    })
  }
  depuis.onchange = rafraichir
  rafraichir()
  return node
}

function panneau() {
  if (!modale) return null
  switch (modale.type) {
    case 'recherche': return panneauRecherche(modale.repas)
    case 'quantite': return panneauQuantite(modale.repas, modale.ing)
    case 'manuel': return panneauManuel(modale.repas)
    case 'libre': return panneauLibre(modale.repas, modale.nom)
    case 'copier': return panneauCopier()
  }
}

/* ── Chrome ──────────────────────────────────────────────────────── */

function allerAu(j: string) {
  if (j === jour) return
  jour = j
  if (jour.slice(0, 7) !== moisAffiche) {
    moisAffiche = jour.slice(0, 7)
    chargerMoisCalendrier()
  }
  precedent = { kcal: 0, arcs: [0, 0, 0] } // la nouvelle journée se dessine depuis zéro
  animerLignes = true
  charger()
}

function glisserJour(n: number) {
  const d = new Date(jour + 'T12:00:00')
  d.setDate(d.getDate() + n)
  if (n > 0 && iso(d) > iso(new Date())) return // pas de repas dans le futur
  allerAu(iso(d))
}

/* ── Calendrier ──────────────────────────────────────────────────── */

/** Semaine lundi->dimanche, toujours paddée à 42 cases (6 semaines) : une
    hauteur stable d'un mois à l'autre, le widget est centré verticalement. */
function grilleMois(mois: string): (string | null)[] {
  const [y, m] = mois.split('-').map(Number)
  const decalage = (new Date(y, m - 1, 1).getDay() + 6) % 7 // getDay(): 0=dim -> lundi=0
  const nbJours = new Date(y, m, 0).getDate()

  const cases: (string | null)[] = Array(decalage).fill(null)
  for (let j = 1; j <= nbJours; j++) cases.push(`${mois}-${String(j).padStart(2, '0')}`)
  while (cases.length < 42) cases.push(null)
  return cases
}

async function chargerMoisCalendrier() {
  const cible = moisAffiche
  const [y, m] = cible.split('-').map(Number)
  const debut = `${cible}-01`
  const fin = `${cible}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  const res = await call<{ jour: string; n: number; kcal: number; uber_eats: number }[]>('joursEntre', { debut, fin })
  if (cible !== moisAffiche) return // le mois a changé pendant le chargement, résultat périmé
  joursActifsMois = new Map(res.map((l) => [l.jour, { n: l.n, kcal: l.kcal, uberEats: !!l.uber_eats }]))
  dessiner()
}

function changerMois(n: number) {
  const [y, m] = moisAffiche.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  const cible = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  if (cible > iso(new Date()).slice(0, 7)) return // pas de mois futur
  moisAffiche = cible
  chargerMoisCalendrier()
}

function calendrier() {
  const auj = iso(new Date())
  const cases = grilleMois(moisAffiche)
  const [y, m] = moisAffiche.split('-').map(Number)
  const libelleMois = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const estMoisCourant = moisAffiche === auj.slice(0, 7)

  const node = el(`
    <aside class="calendrier" aria-label="Calendrier">
      <header class="calendrier__tete">
        <button data-mois-dec aria-label="Mois précédent">‹</button>
        <strong>${libelleMois}</strong>
        <button data-mois-inc aria-label="Mois suivant" ${estMoisCourant ? 'disabled' : ''}>›</button>
      </header>
      <div class="calendrier__jours-noms">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j) => `<span>${j}</span>`).join('')}</div>
      <div class="calendrier__grille">
        ${cases.map((j) => {
          if (!j) return `<span class="calendrier__case calendrier__case--vide"></span>`
          const actif = j === jour, estAuj = j === auj, futur = j > auj
          const info = joursActifsMois.get(j)
          const logge = !!info
          return `<button class="calendrier__case ${actif ? 'calendrier__case--actif' : ''} ${estAuj && !actif ? 'calendrier__case--auj' : ''}"
                    data-jour="${j}" ${futur ? 'disabled' : ''} aria-current="${estAuj ? 'date' : 'false'}"
                    aria-label="${esc(dateFr(j))}${logge ? ', repas loggés' : ''}${info?.uberEats ? ' (Uber Eats)' : ''}">
                    ${Number(j.slice(8))}${logge ? `<span class="calendrier__pastille ${info!.uberEats ? 'calendrier__pastille--uber' : ''}"></span>` : ''}
                  </button>`
        }).join('')}
      </div>
    </aside>`)

  node.querySelector<HTMLButtonElement>('[data-mois-dec]')!.onclick = () => changerMois(-1)
  node.querySelector<HTMLButtonElement>('[data-mois-inc]')!.onclick = () => changerMois(1)
  node.querySelectorAll<HTMLButtonElement>('[data-jour]').forEach((b) => {
    b.onclick = () => allerAu(b.dataset.jour!)
  })
  return node
}

/* ── Moyenne calorique ───────────────────────────────────────────── */

// Rien avant le début du vrai suivi : exclut le bruit des jours de test.
const PLANCHER_STATS = '2026-08-13'
const PERIODES = [
  { cle: 'p7', label: '7 j', jours: 7 },
  { cle: 'p30', label: '30 j', jours: 30 },
  { cle: 'tout', label: 'Tout', jours: null },
] as const
type Periode = (typeof PERIODES)[number]['cle']

let periodeMoyenne: Periode = 'p7'
let moyenneKcal: { valeur: number | null; jours: number } = { valeur: null, jours: 0 }

function bornesPeriode(p: Periode): { debut: string; fin: string } {
  const fin = iso(new Date())
  const def = PERIODES.find((x) => x.cle === p)!
  if (def.jours === null) return { debut: PLANCHER_STATS, fin }
  const d = new Date()
  d.setDate(d.getDate() - (def.jours - 1))
  const debut = iso(d)
  return { debut: debut < PLANCHER_STATS ? PLANCHER_STATS : debut, fin }
}

async function chargerMoyenne() {
  const cible = periodeMoyenne
  const { debut, fin } = bornesPeriode(cible)
  const res = await call<{ jour: string; n: number; kcal: number }[]>('joursEntre', { debut, fin })
  if (cible !== periodeMoyenne) return // la période a changé pendant le chargement
  const jours = res.length
  moyenneKcal = { valeur: jours ? res.reduce((s, r) => s + r.kcal, 0) / jours : null, jours }
  dessiner()
}

function moyenneKcalWidget() {
  const { valeur, jours } = moyenneKcal
  const node = el(`
    <aside class="moyenne" aria-label="Moyenne calorique">
      <div class="moyenne__periode">
        ${PERIODES.map((p) => `<button class="moyenne__pill ${p.cle === periodeMoyenne ? 'moyenne__pill--actif' : ''}"
                                        data-periode="${p.cle}">${p.label}</button>`).join('')}
      </div>
      <div class="moyenne__valeur">
        <span class="chiffre chiffre--grand">${valeur === null ? '—' : r0(valeur)}</span>
        <span class="unite">kcal / jour</span>
      </div>
      <p class="moyenne__detail">${
        jours ? `moyenne sur ${jours} jour${jours > 1 ? 's' : ''} loggé${jours > 1 ? 's' : ''}` : 'aucune donnée sur cette période'
      }</p>
    </aside>`)

  node.querySelectorAll<HTMLButtonElement>('[data-periode]').forEach((b) => {
    b.onclick = () => {
      periodeMoyenne = b.dataset.periode as Periode
      chargerMoyenne()
    }
  })
  return node
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
  node.querySelector<HTMLButtonElement>('[data-aujourdhui]')!.onclick = () => allerAu(iso(new Date()))
  return node
}

/** Facultatif — une pesée par jour, écrasée si on la ressaisit. Vide = pas notée. */
function poidsDuJourWidget() {
  const node = el(`
    <div class="poids">
      <span>Poids</span>
      <span class="poids__saisie">
        <input type="number" inputmode="decimal" step="0.1" min="0"
               placeholder="—" value="${poidsDuJour ?? ''}">
        <span class="unite">kg</span>
      </span>
    </div>`)

  const champ = node.querySelector<HTMLInputElement>('input')!
  champ.onchange = async () => {
    const v = champ.value.trim()
    const kg = v === '' ? null : parseFloat(v)
    if (kg !== null && !(kg > 0)) { champ.value = String(poidsDuJour ?? ''); return }
    poidsDuJour = kg
    await call('definirPoids', { jour, kg })
  }
  champ.onkeydown = (e) => { if (e.key === 'Enter') champ.blur() }
  return node
}

function nouveauRepas() {
  const node = el(`
    <div class="nouveaux-repas">
      <button class="nouveau-repas">+ Ajouter un repas</button>
      <label class="uber-eats">
        <input type="checkbox" data-uber>
        <span>🛵 Repas Uber Eats</span>
      </label>
    </div>`)
  node.querySelector<HTMLButtonElement>('.nouveau-repas')!.onclick = async () => {
    animerLignes = false
    // Le « Repas 1 » d'une journée vide n'existe pas encore en base : on le
    // matérialise avant d'en créer un second, sinon il disparaîtrait à l'écran.
    if (!repasDuJour.length) await call('creerRepas', { jour })
    await call('creerRepas', { jour })
    charger()
  }
  // Pas d'état à réinitialiser : dessiner() redessine une case décochée à
  // chaque rendu, que le panneau soit validé ou fermé.
  node.querySelector<HTMLInputElement>('[data-uber]')!.onchange = (e) => {
    if ((e.target as HTMLInputElement).checked) ouvrir({ type: 'manuel', repas: null })
  }
  return node
}

function pied() {
  const etat = etatDrive()
  const node = el(`
    <footer class="pied">
      <button data-copier>Recopier un repas</button>
      <button data-export>Exporter</button>
      <button data-import>Restaurer</button>
      <button data-reset class="pied__danger">Repartir de zéro</button>
      ${etat.disponible ? `
        <button data-drive>${
          etat.reconnexionRequise ? 'Se reconnecter à Drive'
          : etat.connecte ? 'Déconnecter Drive'
          : 'Connecter Drive'
        }</button>
        ${etat.connecte ? `<span class="pied__etat ${etat.erreur ? 'pied__etat--erreur' : ''}">
          Drive : ${texteEtatDrive(etat)}</span>` : ''}
      ` : ''}
      <input type="file" accept=".sqlite,.db" hidden data-fichier>
    </footer>`)

  node.querySelector<HTMLButtonElement>('[data-copier]')!.onclick = () => ouvrir({ type: 'copier' })

  node.querySelector<HTMLButtonElement>('[data-drive]')?.addEventListener('click', () => {
    etat.connecte && !etat.reconnexionRequise ? deconnecter() : connecter()
  })

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
        await appliquerRestauration(new Uint8Array(await f.arrayBuffer()))
      } catch (err: any) {
        alert(`Restauration impossible : ${err?.message ?? err}\nLa base actuelle est intacte.`)
      }
    }
    fichier.value = '' // sinon re-choisir le même fichier ne déclenche rien
  }

  // Table rase : les aliments restent (ils viennent du build), tout le journal
  // part. 'reinitialiser' est dans OPS_ECRITURE, donc la base vide remonte
  // aussi sur Drive — sinon la prochaine synchro rapatrierait tout.
  node.querySelector<HTMLButtonElement>('[data-reset]')!.onclick = async () => {
    if (!confirm('Effacer tous les repas et toutes les pesées ?\nLes aliments sont conservés. C\'est irréversible.')) return
    await call('reinitialiser')
    precedent = { kcal: 0, arcs: [0, 0, 0] }
    animerLignes = true
    await charger()
  }
  return node
}

/** N'agite que le pied de page : un changement d'état Drive (en attente,
 * synchronisé, erreur…) n'a pas à redessiner toute l'app et couper une saisie
 * en cours ailleurs (recherche, quantité, entrée manuelle…). */
function rafraichirEtatDrive() {
  document.querySelector('.pied')?.replaceWith(pied())
}

function dessiner() {
  // Une journée vierge montre quand même un « Repas 1 » : il se crée en base au
  // premier aliment déposé dedans (repas_id null côté worker).
  const cartes: (Repas | { id: null; ordre: number })[] =
    repasDuJour.length ? repasDuJour : [{ id: null, ordre: 1 }]

  const p = panneau()
  app.replaceChildren(
    calendrier(),
    moyenneKcalWidget(),
    enTete(),
    poidsDuJourWidget(),
    couronne(),
    ...cartes.map(sectionRepas),
    nouveauRepas(),
    pied(),
    ...(p ? [p] : []),
  )
  animerLignes = false
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
    poserIngredients(await call<Ing[]>('ingredients'))
    await navigator.storage?.persist?.()
    surModification(planifierSync)
    surModification(chargerMoyenne)
    surModification(chargerMoisCalendrier)
    surChangementEtat(rafraichirEtatDrive)
    surImportDistant(appliquerRestauration)
    await charger()
    chargerMoisCalendrier().catch(() => {}) // ne bloque jamais le premier rendu
    chargerMoyenne().catch(() => {})
    initialiserDrive().catch(() => {})
  } catch (err: any) {
    const message = String(err?.message ?? err)
    // SQLite garde un verrou exclusif sur le fichier OPFS : un deuxième onglet
    // ne peut pas l'ouvrir. Le message brut du navigateur n'aide personne.
    const dejaOuvert = /Access Handle/i.test(message)

    app.replaceChildren(el(`
      <div class="panne">
        <h2>${dejaOuvert ? 'Déjà ouverte dans un autre onglet' : "La base n'a pas pu s'ouvrir"}</h2>
        ${dejaOuvert
          ? `<p>Tes repas vivent dans un fichier SQLite que l'app verrouille en
               exclusivité — un seul onglet à la fois. Ferme les autres onglets
               de Macros, puis recharge.</p>`
          : `<p>Cette app stocke tes repas dans le navigateur (OPFS). Une fenêtre
               privée ou un navigateur trop ancien bloque ce stockage : réessaie
               dans un onglet normal, sur une version récente de Chrome, Firefox
               ou Safari.</p>`}
        <p class="panne__detail">${esc(message)}</p>
        <button class="valider" data-recharger>Recharger</button>
      </div>`))
    app.querySelector<HTMLButtonElement>('[data-recharger]')!.onclick = () => location.reload()
  }
})()
