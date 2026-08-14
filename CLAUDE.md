# MacroTracker

App web perso de suivi de macros et de poids. Utilisateur unique (Dylan).

**Répondre en français.**

## Ce que c'est

Un site statique déployé sur GitHub Pages
(<https://glutenfree69.github.io/MacroTracker/>), utilisable aussi en local via
`npm run dev`. Ça tourne dans un navigateur de bureau — ce n'est **pas** une app
iOS, ni une PWA à installer sur l'écran d'accueil. Ce virage est délibéré : le
projet a commencé en SwiftUI/SwiftData avant d'être repris en web.

## État actuel

Projet perso qui continue d'évoluer — ce qui suit décrit l'état des lieux, pas
un périmètre figé. Pas besoin de revalider avec Dylan avant d'étendre ou de
changer une de ces lignes ; en cas de doute sur une direction produit, demande
plutôt que de deviner.

| Sujet | Aujourd'hui |
|---|---|
| Macros | saisies **pour 100 g**, quantité pesée en grammes au logging |
| kcal | **saisies**, pas dérivées du 4/4/9 — l'étiquette fait foi, Atwater ne sert qu'à valider |
| Aliments | vivent dans `data/ingredients.yaml`, versionnés par git, validés par la CI |
| Repas | génériques et illimités, `repas(id, jour, ordre)`, libellés « Repas N » par rang |
| Poids | une pesée facultative par jour (table `poids`), pas d'historique de correction — la dernière valeur écrase |
| Objectifs | aucun pour l'instant — pas de cible journalière, pas de barre de progression |
| Vue du jour | anneau de **répartition** (part des kcal par macro) + total au centre |
| Stockage | SQLite en OPFS dans le navigateur (source de vérité) + synchro de secours vers Google Drive (`src/drive.ts`, OAuth2 client-side, optionnelle) |
| Stack | Vite + TypeScript sans framework, SQLite WASM (VFS OPFS-SAHPool) dans un Worker |

Deux contraintes techniques enchaînées, qui expliquent le VFS choisi : le VFS
OPFS classique exige `SharedArrayBuffer`, donc des en-têtes COOP/COEP que GitHub
Pages ne sait pas émettre → on prend **SAHPool** ; et `createSyncAccessHandle()`
n'est autorisé que hors du thread principal → tout SQLite vit dans
`src/db.worker.ts`.

## Invariant d'architecture — la seule règle qui ne bouge pas

Une ligne de `ligne` stocke un **snapshot** des macros au moment du log
(colonnes `kcal`, `proteines`, `glucides`, `lipides`, `fibres` en valeur absolue),
pas une jointure vers l'ingrédient. Corriger un aliment aujourd'hui ne doit
**jamais** réécrire les journées passées — c'est la raison d'être de l'app : un
produit change de recette ou de fournisseur. `ingredient_id` n'est gardé que pour
le confort d'analyse.

Corollaire : toute feature qui touche les ingrédients doit être vérifiée contre
ce scénario avant d'être considérée comme terminée. Même logique pour tout
mécanisme de sync (Drive ou futur) : il transporte le fichier `.sqlite` tel
quel, il ne doit jamais recalculer ou rejouer les lignes.

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
  bases OPFS distinctes. Ce qui est saisi en local ne remonte pas en ligne tout
  seul. Le pont : Exporter / Restaurer manuel, ou la synchro Drive si connectée
  des deux côtés.
- **Fenêtre privée = pas d'OPFS.** L'app affiche un écran d'erreur explicite
  plutôt que de faire semblant.
- **Un seul onglet.** SQLite verrouille son fichier OPFS en exclusivité ; un
  deuxième onglet échoue à l'ouverture. `src/app.ts` reconnaît l'erreur et le dit
  en français au lieu d'afficher le message brut du navigateur.
- **Évolution de schéma additive.** `CREATE TABLE IF NOT EXISTS` / nouvelle
  colonne suffit dans la plupart des cas (voir `poids`). Pour une vraie
  restructuration, suivre le modèle de `migrer()` dans `src/db.worker.ts`
  (reconstruire plutôt que `DROP TABLE`) : les journées passées ne se
  réécrivent pas.
- **Google Drive : l'API doit être activée** dans le projet GCP
  (`console.developers.google.com/apis/api/drive.googleapis.com`), sinon la
  synchro échoue en 403 `accessNotConfigured` dès la première tentative.
- **Brave (et navigateurs à bloqueurs agressifs)** : Shields peut bloquer la
  ré-auth silencieuse Google (`prompt: 'none'`) ou empêcher la popup de
  connexion initiale. L'app retombe proprement sur « reconnexion nécessaire » ;
  si la popup ne s'ouvre jamais, désactiver Shields pour le site en dépannage.
