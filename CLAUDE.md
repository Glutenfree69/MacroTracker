# MacroTracker

App iOS perso de suivi de macros. Utilisateur unique (Dylan), pas de backend,
pas de distribution App Store.

**Répondre en français.**

## État actuel

⚠️ **Rien n'est encore implémenté.** Le repo contient la conception, pas le code.
Lire **[PLAN.md](PLAN.md)** avant de commencer — il contient le modèle de données,
les écrans, l'arbo cible et le parcours de recette.

## Périmètre v1 — ne pas élargir sans qu'on le demande

Logger des repas, voir les totaux glucides / protéines / lipides / calories du jour.
C'est tout. Explicitement **hors périmètre** : API externe (OpenFoodFacts & co),
code-barres, comptes utilisateurs, sync cloud, export, historique/graphiques,
recettes composées, micronutriments.

## Décisions arrêtées — ne pas relitiger

| Sujet | Décision |
|---|---|
| Macros | saisies **pour 100 g**, quantité pesée en grammes au logging |
| kcal | **saisies**, pas dérivées du 4/4/9 (l'étiquette fait foi) |
| Objectifs | 4 cibles journalières + anneaux/barres de progression animés |
| Organisation | entrées **groupées par repas** (petit-déj / déjeuner / dîner / collation) |
| Stack | SwiftUI + SwiftData, deployment target **iOS 26.0** |
| Projet Xcode | généré par **XcodeGen** depuis `project.yml` |

## Invariant d'architecture (le plus important)

`LogEntry` stocke un **snapshot** des macros au moment du log, pas seulement une
référence vers `Food`. Modifier un aliment aujourd'hui ne doit **jamais** réécrire
les journées passées — c'est la raison d'être de l'app (un produit change de recette
ou de fournisseur). Le lien `food: Food?` n'existe que pour le confort, il est
optionnel et nullifié à la suppression.

Corollaire : toute nouvelle feature qui touche `Food` doit être vérifiée contre ce
scénario avant d'être considérée comme terminée.

## Environnement — deux Macs

Le repo circule par git entre :
- **Mac sans Xcode** — conception uniquement, aucune compilation possible (pas de SDK iOS).
- **Mac avec Xcode** — implémentation, build, déploiement. **Tout le travail de code se fait ici.**

Vérifier où on est avant de proposer quoi que ce soit :

```bash
xcode-select -p                 # /Applications/Xcode.app/... → on peut coder
xcodebuild -version
xcrun devicectl list devices    # iPhone 17 (iOS 26.6) visible une fois branché
```

Si `xcode-select -p` renvoie `/Library/Developer/CommandLineTools`, on est sur le
mauvais Mac : ne pas écrire de SwiftUI à l'aveugle, le dire.

## Commandes

```bash
brew install xcodegen           # une fois
xcodegen generate               # après toute modif de project.yml

# compiler sans iPhone ni signature — le filet de sécurité par défaut
xcodebuild -scheme MacroTracker -destination 'generic/platform=iOS Simulator' build

./deploy.sh                     # build + install sur l'iPhone branché
```

`MacroTracker.xcodeproj` est **généré et git-ignoré**. Ne jamais l'éditer à la main :
ajouter un fichier Swift ne demande aucune action, modifier la config passe par
`project.yml`.

## Workflow attendu

- **Compiler après chaque étape.** SwiftUI casse à la compilation bien plus qu'il ne
  casse à l'exécution (inférence de types, macros SwiftData). Ne pas empiler des
  centaines de lignes non compilées.
- Pour tout ce qui est visuel, lancer le simulateur et **regarder** avant de dire que
  c'est fini.
- Dérouler le parcours de recette de `PLAN.md` avant d'annoncer une feature terminée.

## Signature

Compte Apple gratuit → la signature expire au bout de **7 jours** et l'app refuse de
se lancer. `./deploy.sh` la réinstalle en ~30 s. C'est normal, ce n'est pas un bug à
investiguer.
