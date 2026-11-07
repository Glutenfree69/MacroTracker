# MacroTracker

Suivi quotidien de macros (repas, calories, poids). Application web
personnelle, statique, sans backend, sans compte.

**Démo :** <https://glutenfree69.github.io/MacroTracker/>

## Stack

Vite + TypeScript, sans framework · SQLite WASM (OPFS) dans un Web Worker ·
GitHub Pages.

## Démarrage

```bash
npm install
npm run dev      # http://localhost:5173/MacroTracker/
```

| Commande | Effet |
|---|---|
| `npm run check` | valide `data/ingredients.yaml` |
| `npm run build` | valide + `tsc --noEmit` + build → `dist/` |
| `npm run preview` | sert `dist/` comme le fera GitHub Pages |

## Modèle de données

| | Stockage | Modification |
|---|---|---|
| Aliments | `data/ingredients.yaml`, versionné | édition + push, la CI valide |
| Repas, poids | SQLite local (navigateur, OPFS) | dans l'app |

Sauvegarde : synchro automatique optionnelle vers Google Drive, ou
export/restauration manuelle du fichier `.sqlite` — boutons en pied de page.

## Déploiement

`npm run deploy` : build local puis push de `dist/` sur la branche `gh-pages`,
servie par GitHub Pages.

Le workflow `.github/workflows/deploy.yml` (push sur `main` → validation +
déploiement) est en pause tant que GitHub Actions n'est pas disponible sur le
compte.
