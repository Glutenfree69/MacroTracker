# MacroTracker

App web perso de suivi de macros. Utilisateur unique (Dylan), pas de backend,
pas de compte, pas d'API externe.

**Répondre en français.**

## Ce que c'est

Un site statique déployé sur GitHub Pages
(<https://glutenfree69.github.io/MacroTracker/>), utilisable aussi en local via
`npm run dev`. Ça tourne dans un navigateur de bureau — ce n'est **pas** une app
iOS, ni une PWA à installer sur l'écran d'accueil. Ce virage est délibéré : le
projet a commencé en SwiftUI/SwiftData avant d'être repris en web.

## Périmètre v1 — ne pas élargir sans qu'on le demande

Logger des repas, voir les totaux glucides / protéines / lipides / calories du
jour, régler ses objectifs. C'est tout. Explicitement **hors périmètre** : API
externe (OpenFoodFacts & co), code-barres, comptes utilisateurs, sync cloud,
graphiques d'historique, recettes composées, micronutriments.

## Décisions arrêtées — ne pas relitiger

| Sujet | Décision |
|---|---|
| Macros | saisies **pour 100 g**, quantité pesée en grammes au logging |
| kcal | **saisies**, pas dérivées du 4/4/9 — l'étiquette fait foi, Atwater ne sert qu'à valider |
| Aliments | vivent dans `data/ingredients.yaml`, versionnés par git, validés par la CI |
| Repas | vivent dans le navigateur, base SQLite en OPFS, jamais poussés |
| Objectifs | 4 cibles journalières, **datées** (`objectif(depuis, …)`) |
| Organisation | entrées groupées par repas (petit-déj / déjeuner / dîner / collation) |
| Stack | Vite + TypeScript sans framework, SQLite WASM (VFS OPFS-SAHPool) dans un Worker |

Deux contraintes techniques enchaînées, qui expliquent le VFS choisi : le VFS
OPFS classique exige `SharedArrayBuffer`, donc des en-têtes COOP/COEP que GitHub
Pages ne sait pas émettre → on prend **SAHPool** ; et `createSyncAccessHandle()`
n'est autorisé que hors du thread principal → tout SQLite vit dans
`src/db.worker.ts`.

## Invariant d'architecture (le plus important)

Une ligne de `ligne` stocke un **snapshot** des macros au moment du log
(colonnes `kcal`, `proteines`, `glucides`, `lipides`, `fibres` en valeur absolue),
pas une jointure vers l'ingrédient. Corriger un aliment aujourd'hui ne doit
**jamais** réécrire les journées passées — c'est la raison d'être de l'app : un
produit change de recette ou de fournisseur. `ingredient_id` n'est gardé que pour
le confort d'analyse.

Corollaire : toute feature qui touche les ingrédients doit être vérifiée contre
ce scénario avant d'être considérée comme terminée.

## Commandes

```bash
npm install
npm run dev      # http://localhost:5173/MacroTracker/
npm run check    # valide data/ingredients.yaml sans rien écrire
npm run build    # valide + tsc --noEmit + vite build -> dist/
npm run preview  # sert dist/ comme le fera GitHub Pages
```

`public/ingredients.json` est **généré** depuis `data/ingredients.yaml` par
`scripts/build-ingredients.mjs` et git-ignoré. Ne jamais l'éditer à la main.

Le déploiement est automatique : push sur `main` → workflow
`.github/workflows/deploy.yml` → Pages. Une PR ne fait que valider.

## Workflow attendu

- **Builder après chaque étape.** `npm run build` enchaîne validation des données,
  `tsc --noEmit` et le bundle : c'est le filet de sécurité par défaut.
- Pour tout ce qui est visuel, **regarder** le rendu dans un navigateur avant de
  dire que c'est fini. `npm run preview` sert exactement ce que Pages servira,
  base `/MacroTracker/` comprise.
- Le validateur d'ingrédients est là pour attraper la virgule décalée et les
  valeurs par portion recopiées en valeurs pour 100 g. Ne pas l'assouplir pour
  faire passer une donnée : c'est la donnée qui est fausse.

## Pièges connus

- **La casse compte** dans l'URL Pages : `/MacroTracker/`, pas `/macrotracker/`.
  Le défaut de `vite.config.ts` doit rester aligné sur le nom du repo.
- **Les données sont par origine.** `localhost:5173` et `github.io` sont deux
  bases OPFS distinctes. Les repas saisis en local ne remontent pas en ligne.
  Le pont, c'est Exporter / Restaurer.
- **Fenêtre privée = pas d'OPFS.** L'app affiche un écran d'erreur explicite
  plutôt que de faire semblant.
