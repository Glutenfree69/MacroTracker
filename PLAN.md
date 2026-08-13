# MacroTracker — plan d'implémentation v1

## Contexte

App iOS perso (utilisateur unique) pour logger ses repas et suivre
glucides / protéines / lipides / calories sur la journée. Pas d'API externe
(OpenFoodFacts & co) : les macros sont saisies à la main, mémorisées dans une
bibliothèque d'aliments, et **re-validées à chaque réutilisation** — un même produit
peut changer de recette ou de fournisseur, l'historique ne doit pas mentir.

Objectif v1 : périmètre minimal mais fini et beau. Logging + totaux du jour. C'est tout.

Choix validés : macros **pour 100 g**, **objectifs journaliers avec anneaux animés**,
entrées **groupées par repas**.

Cible : iPhone 17, iOS 26.6.

### Avant de commencer

Ce plan a été rédigé sur le Mac **sans Xcode**. L'implémentation se fait sur le Mac
qui a Xcode. Vérifier en arrivant :

```bash
xcode-select -p                 # doit pointer vers /Applications/Xcode.app
xcodebuild -version
xcrun devicectl list devices    # iPhone visible une fois branché
brew install xcodegen           # si absent
```

Prérequis manuels (GUI, non automatisables) : Xcode → Settings → Accounts → Apple ID
(compte gratuit suffisant) ; sur l'iPhone → Réglages → Confidentialité et sécurité →
Mode développeur → ON, puis « Se fier » à ce Mac.

---

## Stack

- **SwiftUI** + **SwiftData** (persistance locale, zéro backend)
- Deployment target **iOS 26.0** (seul appareil cible → aucune contrainte de rétro-compat)
- Projet généré par **XcodeGen** depuis un `project.yml` versionné → le `.xcodeproj`
  est régénérable et jetable, et ajouter un fichier Swift ne demande aucune édition
  manuelle.

---

## Modèle de données

`App/Models/` — 4 fichiers, SwiftData.

**`Food.swift`** — la bibliothèque d'aliments réutilisables.

```swift
@Model final class Food {
    var name: String
    var brand: String?
    // toujours pour 100 g
    var proteinPer100: Double
    var carbsPer100:   Double
    var fatPer100:     Double
    var kcalPer100:    Double   // saisi (l'étiquette diffère souvent du 4/4/9 théorique)
    var lastUsedAt: Date?
    var useCount:   Int         // → tri du sélecteur par fréquence
    var updatedAt:  Date        // → affiché dans l'écran de validation
    var createdAt:  Date
}
```

**`LogEntry.swift`** — une ligne de repas. **Point clé : snapshot, pas référence.**

```swift
@Model final class LogEntry {
    var date: Date          // horodatage précis
    var day:  Date          // startOfDay — clé de regroupement, requête rapide par jour
    var mealRaw: String     // MealSlot
    var grams: Double

    // ── snapshot des macros au moment du log ──
    var foodName:  String
    var foodBrand: String?
    var proteinPer100: Double
    var carbsPer100:   Double
    var fatPer100:     Double
    var kcalPer100:    Double

    var food: Food?         // lien souple (nullify on delete)
}
```

Le snapshot est ce qui rend la contrainte « le fournisseur a changé » correcte :
corriger un `Food` aujourd'hui **ne réécrit pas** les journées passées. Les valeurs
consommées (`protein`, `carbs`, `fat`, `kcal`) sont calculées : `perCent * grams / 100`.

**`Goals.swift`** — singleton (une seule ligne, créée au premier lancement) :
`kcal`, `protein`, `carbs`, `fat`.

**`MealSlot.swift`** — enum `petitDej / dejeuner / diner / collation`, avec libellé FR,
symbole SF et ordre de tri.

---

## Écrans

`App/Views/`

### 1. `TodayView.swift` — écran principal

- En-tête de navigation par jour : `‹  Aujourd'hui  ›` + swipe horizontal entre les jours.
- **Hero** : anneau de calories animé (`Shape` + `.trim`, ressort) au centre,
  chiffre en `contentTransition(.numericText())` pour que le total « roule ».
- **3 barres de macros** sous l'anneau (P / G / L), chacune sa couleur, valeur / objectif.
- **Sections par repas** avec sous-total kcal par section, swipe-to-delete sur les
  entrées, bouton `+` contextuel par section (pré-sélectionne le repas).
- Dépassement d'objectif = la barre change de teinte plutôt que de déborder.

### 2. Flux d'ajout (3 vues)

- **`FoodPickerView.swift`** — barre de recherche en haut, liste des aliments
  enregistrés triés par récence puis fréquence (`lastUsedAt`, `useCount`),
  + bouton « Nouvel aliment ». Aucun résultat → propose directement la création.
- **`ConfirmMacrosView.swift`** — ⭐ **l'étape de validation, cœur de l'app.**
  Champs pour-100-g pré-remplis et **éditables**, avec un bandeau discret
  « Vérifie l'étiquette · modifié le 3 mars ». En dessous : quantité en grammes +
  aperçu live de ce que l'entrée va ajouter. Si une valeur a été modifiée au moment
  d'enregistrer → confirmation : **« Mettre à jour l'aliment enregistré »** /
  **« Juste pour cette fois »** (ce dernier n'écrit que le snapshot).
- **`FoodFormView.swift`** — même formulaire, vide, pour un nouvel aliment.
  Réutilisé par `ConfirmMacrosView` et par la bibliothèque (un seul composant de saisie).

### 3. `FoodLibraryView.swift`

Liste + recherche de tous les aliments, édition, suppression. Suppression = les
`LogEntry` passés survivent intacts (grâce au snapshot).

### 4. `SettingsView.swift`

Les 4 objectifs journaliers. Bouton d'aide qui calcule les kcal depuis P/G/L (4/4/9).

---

## Direction visuelle

`App/Support/Theme.swift` centralise couleurs et constantes — une seule source de vérité,
réutilisée par l'anneau, les barres et les pastilles de macro.

- Une couleur par macro, cohérente sur **tous** les écrans.
- Cartes en `.ultraThinMaterial` sur fond dégradé sobre.
- Animations ressort à chaque changement de total ; retour haptique
  (`.sensoryFeedback`) à l'enregistrement d'une entrée.
- Light **et** dark mode, dynamic type respecté.

---

## Arbo cible

```
MacroTracker/
├── project.yml                  ← spec XcodeGen (bundle id, target iOS 26, signing)
├── deploy.sh                    ← build + install sur l'iPhone, une commande
└── App/
    ├── MacroTrackerApp.swift    ← @main, ModelContainer, seed des Goals
    ├── Assets.xcassets/         ← AccentColor, AppIcon, couleurs macro
    ├── Models/    Food · LogEntry · Goals · MealSlot
    ├── Views/     Today · MacroRing · MacroBars · MealSection ·
    │              FoodPicker · ConfirmMacros · FoodForm · FoodLibrary · Settings
    └── Support/   Theme · Formatters
```

`deploy.sh` enchaîne : `xcodegen generate` → `xcodebuild -allowProvisioningUpdates`
→ `xcrun devicectl device install app`. L'UDID est résolu automatiquement depuis
`xcrun devicectl list devices`.

À trancher au premier build : le **bundle id** (défaut proposé
`com.glutenfree.macrotracker`) et le **Team ID**, récupéré automatiquement par
`xcodebuild -allowProvisioningUpdates` une fois l'Apple ID connecté dans Xcode.

---

## Ordre d'implémentation suggéré

1. `project.yml` + arbo vide + `MacroTrackerApp.swift` → **compiler** (valide le socle).
2. Modèles SwiftData + `Theme.swift` → **compiler**.
3. `TodayView` avec des données factices → **simulateur**, valider le visuel.
4. Flux d'ajout complet (Picker → Confirm → save) → **simulateur**, dérouler la recette.
5. Bibliothèque + réglages.
6. `deploy.sh` → installation sur l'iPhone.

---

## Signature

⚠️ **Compte Apple gratuit = signature valable 7 jours.** L'app cesse de se lancer
après une semaine ; relancer `./deploy.sh` la réinstalle en ~30 s. Un compte
développeur payant (99 $/an) porterait ça à 1 an.

---

## Vérification

1. **Compilation sans iPhone ni signature** — premier filet de sécurité :
   `xcodebuild -scheme MacroTracker -destination 'generic/platform=iOS Simulator' build`
2. **Simulateur** — lancer, dérouler le parcours complet.
3. **Device** — `./deploy.sh`, vérifier que l'app s'ouvre sur l'iPhone.
4. **Parcours manuel de recette :**
   - créer un aliment (ex. Skyr, 10 P / 4 G / 0.2 L / 60 kcal /100 g) → le logger à 200 g
     → vérifier `20 P / 8 G / 0.4 L / 120 kcal` sur l'anneau et les barres ;
   - re-logger le même aliment → l'écran de validation apparaît **pré-rempli** ;
   - y modifier les protéines → choisir **« Juste pour cette fois »** →
     l'aliment en bibliothèque est **inchangé** ;
   - recommencer → choisir **« Mettre à jour »** → la bibliothèque suit,
     et **l'entrée d'hier garde ses anciennes valeurs** (le test qui compte) ;
   - supprimer l'aliment de la bibliothèque → les entrées passées restent affichées ;
   - changer les objectifs → les anneaux se re-proportionnent ;
   - naviguer sur la veille / le lendemain → totaux corrects et indépendants ;
   - tuer et relancer l'app → tout est persisté.
