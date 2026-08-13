# Macros

Tracker de macros perso. Un site statique, sans backend, sans compte, sans API
externe. Il tourne dans un navigateur de bureau.

**En ligne :** <https://glutenfree69.github.io/MacroTracker/>

```bash
npm install
npm run dev      # http://localhost:5173/MacroTracker/
```

---

## Le partage des rôles

C'est la seule idée à retenir, tout le reste en découle.

| | Où ça vit | Comment ça se modifie |
|---|---|---|
| **Les aliments** | `data/ingredients.yaml`, dans git | tu édites le fichier, tu pousses, la CI valide et redéploie |
| **Tes repas** | une base SQLite dans ton navigateur (OPFS) | tu cliques dans l'app, rien ne part sur le réseau |

Les aliments dans git, parce qu'une base d'aliments se relit, se corrige et se
justifie : `git log -p data/ingredients.yaml` te dira pourquoi tu avais mis
349 kcal en mars. Les repas dans le navigateur, parce que ce sont des données
quotidiennes qui n'ont rien à faire dans un dépôt public.

Pas de recettes : un repas, c'est N lignes `(aliment, grammes)`. C'est ce que tu
fais déjà avec la balance.

---

## Ajouter tes premiers aliments

C'est **la** manip à connaître. Ouvre `data/ingredients.yaml` et ajoute un bloc :

```yaml
- id: thon_naturel            # snake_case, immuable — c'est la clé
  nom: Thon au naturel (égoutté)
  categorie: proteines        # sert juste à regrouper la liste de choix
  kcal: 116                   # ⚠ POUR 100 g, recopiées de l'étiquette
  proteines: 26.0
  glucides: 0.0
  lipides: 1.2
  fibres: 0.0
  portions:                   # optionnel — des raccourcis de pesée
    - { label: "1 boîte égouttée", g: 112 }
  note: "Petit Navire — étiquette du 2026-08-11"   # optionnel
```

Vérifie avant de pousser :

```bash
npm run check
```

Puis :

```bash
git add data/ingredients.yaml
git commit -m "aliments : thon au naturel"
git push
```

Environ une minute plus tard, la CI a validé et Pages a redéployé. Recharge
l'onglet : le thon est dans la liste. Tes repas déjà saisis ne bougent pas.

### Les deux règles qui évitent les données fausses

**1. Toujours pour 100 g.** Pas par portion, pas par boîte. Une étiquette qui
n'affiche que « par portion de 30 g » se convertit à la main avant d'entrer ici.

**2. Pèse-le dans l'état où tu le mangeras.** Si tu pèses ton riz *cuit*, crée
`riz_basmati_cuit` avec les macros du cru divisées par le rendement (~2,5 pour le
riz, ~2,4 pour les pâtes et les lentilles). Sinon tes glucides sont faux d'un
facteur 2,5, et silencieusement.

### Ce que le validateur refuse

`npm run check` (et la CI, sur chaque push et chaque PR) recale :

- **l'incohérence Atwater** : `4×P + 4×G + 9×L + 2×fibres` doit retomber sur les
  kcal déclarées, à 5 % près (plancher de 12 kcal, pour ne pas recaler le brocoli
  sur un arrondi d'étiquette). Ça attrape les trois erreurs qui pourrissent une
  base faite main : la virgule décalée, les valeurs par portion recopiées comme
  valeurs pour 100 g, et les glucides « dont sucres » mis dans le total ;
- **P + G + L + fibres > 100 g** pour 100 g d'aliment ;
- ids dupliqués, ids non-slug, nombres négatifs, portions malformées.

Quand ça coince, le message dit quoi regarder. Ne desserre pas la tolérance pour
faire passer une valeur : si Atwater proteste, c'est presque toujours la donnée
qui est fausse.

---

## Utiliser l'app

- **‹ ›** ou les flèches **←** / **→** changent de jour. Clic sur la date =
  retour à aujourd'hui.
- **+ Ajouter un aliment** ouvre la liste. Tape pour filtrer, **Entrée** prend le
  premier résultat.
- Saisis les grammes (ou clique une portion), **Entrée** valide. **Échap** ferme.
- **Objectifs** règle les 4 cibles. Elles sont **datées** : elles s'appliquent à
  partir du jour affiché et les journées passées gardent les leurs.
- **Recopier un repas** rejoue un repas d'un autre jour. Sans ça, on tient deux
  semaines.

La grosse barre, c'est la journée : sa largeur ce sont les kcal, ses segments
d'où viennent ces kcal, le cran vertical marque l'objectif.

---

## Sauvegarder

Tes repas ne vivent que dans le navigateur où tu les as saisis. Deux conséquences
à intégrer une fois pour toutes :

1. **`localhost` et `github.io` sont deux bases différentes.** Ce que tu logues en
   local ne remonte pas en ligne, et inversement. Choisis-en une pour de bon.
2. **Le stockage peut être évincé** par le navigateur (nettoyage automatique,
   « effacer les données de site »). L'app demande `navigator.storage.persist()`
   pour limiter ça, mais ce n'est pas une garantie.

D'où les deux boutons en pied de page :

- **Exporter** télécharge `macros-AAAA-MM-JJ.sqlite`, le fichier SQLite brut.
- **Restaurer** le recharge — c'est aussi comme ça qu'on déménage ses données
  d'un navigateur à l'autre. La table des aliments est re-semée depuis le build
  courant : le fichier restauré n'écrase jamais ce que dit git.

Exporte de temps en temps. Un `.sqlite` de plusieurs mois de repas pèse quelques
dizaines de ko.

---

## Analyser ses données

L'export s'ouvre directement avec le client `sqlite3` :

```bash
sqlite3 macros-2026-08-13.sqlite
```

```sql
-- Protéines et calories, jour par jour
SELECT jour, ROUND(SUM(proteines)) AS p, ROUND(SUM(kcal)) AS kcal
FROM ligne GROUP BY jour ORDER BY jour DESC LIMIT 30;

-- Les aliments qui portent réellement tes calories
SELECT nom, ROUND(SUM(kcal)) AS total, COUNT(*) AS fois
FROM ligne GROUP BY ingredient_id ORDER BY total DESC LIMIT 15;

-- Répartition moyenne des macros
SELECT ROUND(AVG(p)) AS prot, ROUND(AVG(g)) AS gluc, ROUND(AVG(l)) AS lip
FROM (SELECT SUM(proteines) p, SUM(glucides) g, SUM(lipides) l
      FROM ligne GROUP BY jour);
```

C'est le vrai intérêt de garder ça en SQL plutôt que dans une app fermée.

---

## Sous le capot

**Une ligne de log est une écriture comptable, pas une jointure.** La table
`ligne` porte `kcal`, `proteines`, `glucides`, `lipides`, `fibres` en valeur
absolue, figées au moment de la saisie. Corriger un aliment en novembre ne
réécrit pas tes journées de mars — c'est l'invariant central du projet.

**Objectifs datés.** `objectif(depuis, …)` ; une journée résout
`WHERE depuis <= jour ORDER BY depuis DESC LIMIT 1`. Tu changes de cap sans
falsifier les journées passées.

**VFS OPFS-SAHPool, dans un Worker.** Le VFS OPFS classique exige
`SharedArrayBuffer`, donc des en-têtes COOP/COEP que GitHub Pages ne permet pas
de définir ; SAHPool s'en passe. Et le Worker est obligatoire :
`createSyncAccessHandle()` n'est pas autorisé sur le thread principal.

**JSON pour amorcer les aliments, pas SQLite.** Pour quelques centaines de
lignes, télécharger un `.sqlite` et le parser en wasm pour tout réinsérer est du
cérémonial. Le SQLite qui compte, c'est celui de tes logs.

**Pas de framework, pas de webfont, pas de service worker.** ~350 lignes de TS
qui manipulent le DOM, et trois couleurs qui portent l'information (une par
macro) au lieu de décorer.

## Déploiement

`.github/workflows/deploy.yml` :

- sur une **PR** → seul le job `valider` tourne (`npm run check`), il refuse de
  merger une base d'aliments incohérente ;
- sur un **push sur `main`** → validation, build, publication sur Pages.

Côté repo, une fois pour toutes : Settings → Pages → Source = **GitHub Actions**.
