# MacroTracker

App iOS perso de suivi de macros — glucides, protéines, lipides, calories.
Utilisateur unique, données 100 % locales, aucune API externe.

> **Statut : conception terminée, implémentation pas commencée.**
> Voir [PLAN.md](PLAN.md).

## Le principe

Tu saisis les macros de chaque aliment à la main, **pour 100 g**. L'app les mémorise
dans une bibliothèque. À chaque réutilisation elle te les represente **pré-remplies et
éditables** : si le produit a changé de recette ou de fournisseur, tu corriges sur le
moment — et tu choisis si la correction s'applique à la bibliothèque ou juste à cette
entrée. Les journées déjà enregistrées ne bougent jamais.

## Stack

SwiftUI · SwiftData · iOS 26 · projet généré par XcodeGen

## Démarrer

Nécessite un Mac avec **Xcode** (pas seulement les Command Line Tools) et un Apple ID
connecté dans Xcode → Settings → Accounts.

```bash
brew install xcodegen
xcodegen generate

# compiler sans iPhone ni signature
xcodebuild -scheme MacroTracker -destination 'generic/platform=iOS Simulator' build

# installer sur l'iPhone branché en USB
./deploy.sh
```

Sur l'iPhone, une seule fois : Réglages → Confidentialité et sécurité →
Mode développeur → ON, puis « Se fier » à ce Mac.

## Note sur la signature

Avec un compte Apple gratuit, la signature expire au bout de **7 jours** et l'app
refuse de se lancer. `./deploy.sh` la réinstalle en ~30 s. C'est le comportement
normal d'Apple, pas un bug.
