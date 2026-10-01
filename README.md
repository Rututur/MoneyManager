# MoneyManager

Application web simple pour gérer son budget mensuel.

1. Indique tes **revenus** du mois (salaire, primes, aides…).
2. Liste tes **dépenses obligatoires** (loyer, factures, assurances…).
3. Choisis comment **répartir le reste** en pourcentages (épargne, loisirs, vie courante, imprévus…).

L'application calcule automatiquement le montant à mettre dans chaque poste.

## Fonctionnalités

- Revenus et dépenses obligatoires librement modifiables (ajout / suppression de lignes)
- Répartition en pourcentages personnalisables, avec des modèles prêts à l'emploi
- Résultats : reste à répartir, montant par poste, barre de répartition des revenus
- Indicateur du poids des dépenses obligatoires dans les revenus
- Un budget par mois, historique et reprise du mois précédent
- Synchronisation en ligne (Firebase) : mêmes données sur ordinateur et téléphone, mises à jour en direct
- Copie locale dans le navigateur (affichage immédiat, fonctionne même sans réseau), export / import en JSON
- Installable comme une application sur téléphone (« Ajouter à l'écran d'accueil »)
- Thème clair / sombre automatique

## Lancer en local

Sans configuration Firebase, ouvre simplement `index.html` dans ton navigateur (données dans ce navigateur uniquement).

Avec Firebase, il faut passer par un petit serveur local (la connexion ne fonctionne pas en `file://`), par exemple
avec l'extension VS Code **Live Server**, ou teste directement sur GitHub Pages.

## Synchronisation en ligne (Firebase, gratuit)

1. Va sur <https://console.firebase.google.com>, **Créer un projet** (Google Analytics inutile).
2. **Ajouter une application → Web (`</>`)**, donne-lui un nom, puis copie les valeurs de `firebaseConfig`
   dans [`config.js`](config.js).
3. **Build → Authentication → Commencer → Adresse e-mail/Mot de passe → Activer**.
4. **Build → Firestore Database → Créer une base de données**, emplacement `eur3 (europe-west)`,
   mode **production**. Dans l'onglet **Règles**, colle le contenu de [`firestore.rules`](firestore.rules) puis **Publier**.
5. **Authentication → Paramètres → Domaines autorisés** : ajoute `<ton-pseudo>.github.io`.
6. Ouvre le site, clique sur **Créer mon compte**. Tes données déjà présentes dans ce navigateur sont envoyées en ligne
   automatiquement à la première connexion.
7. Sur ton téléphone, ouvre la même adresse et connecte-toi avec le même compte.

Les valeurs de `config.js` ne sont pas secrètes (elles peuvent être publiées sur GitHub) : ce sont les règles Firestore
qui garantissent que chaque compte ne voit que ses propres données.

## Installer sur le téléphone

- **Android (Chrome)** : menu ⋮ → **Ajouter à l'écran d'accueil** / **Installer l'application**.
- **iPhone (Safari)** : bouton Partager → **Sur l'écran d'accueil**.

## Publier sur GitHub

```bash
git init
git add .
git commit -m "Première version de MoneyManager"
git branch -M main
git remote add origin https://github.com/<ton-pseudo>/MoneyManager.git
git push -u origin main
```

Pour la rendre accessible en ligne : sur GitHub, **Settings → Pages → Source : Deploy from a branch → `main` / `root`**.
Le site sera disponible sur `https://<ton-pseudo>.github.io/MoneyManager/`.

## Confidentialité

- **Sans Firebase** : toutes les données restent dans ton navigateur (`localStorage`), rien n'est envoyé sur Internet.
- **Avec Firebase** : les données sont stockées dans ta base Firestore, accessible uniquement avec ton compte.
  Une copie reste dans le navigateur ; elle est effacée quand tu te déconnectes.

Dans les deux cas, **Exporter** permet de garder une sauvegarde en fichier.
