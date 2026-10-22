# Russ'idge Roulette

App mobile perso qui tire des ingrédients au hasard (par catégorie, sans dépasser un budget) et en fait une liste de courses.

C'est une app web installable (PWA) : une seule app pour Android et iPhone, sans store, qui marche hors connexion. Aucun serveur ni compte : chaque téléphone garde ses propres réglages et sa liste.

## Installer sur le téléphone

L'app doit être servie en HTTPS. Le plus simple est GitHub Pages :

1. Sur GitHub : *Settings → Pages → Deploy from a branch → `main` / `(root)`*.
2. Ouvrir l'adresse donnée (`https://<compte>.github.io/<dépôt>/`) sur le téléphone.
3. Android (Chrome) : menu ⋮ → *Ajouter à l'écran d'accueil*. iPhone (Safari) : bouton Partager → *Sur l'écran d'accueil*.

## Utilisation

- **Tirage** : nombre d'ingrédients par catégorie (− / +), budget (curseur par 5 €, ou tap sur le montant pour le saisir). Le budget minimum s'affiche en direct.
- **Liste** : regroupée par rayon. Tap = cocher. Appui long = sélectionner, puis *Relancer*, *Relancer le reste* ou *Masquer*.
- **Paramètres** (⚙) : prix au paquet ou au kilo, son du clic, ingrédients masqués.

## Les ingrédients : `ingredients.csv`

Une ligne par produit, au format Excel français (séparateur `;`, virgule décimale) :

```
nom;categorie;rayon;prix;quantite;unite
Lentilles vertes;Légumineuses;Épicerie;1,35;500;g
```

- `categorie` : une des 10 catégories de l'app (Viandes et poissons, Œufs et laitages, Légumineuses, Féculents, Légumes, Fruits, Surgelés, Desserts, Boulangerie, Boissons). Un produit surgelé va toujours dans Surgelés.
- `prix` : prix du paquet en euros. `quantite` + `unite` (`g`, `ml` ou `pièce`) : contenu du paquet, qui sert au prix au kilo.
- Les prix viennent du site Intermarché (octobre 2026), sans magasin précis : ce sont des repères, pas les prix exacts de ton magasin. Ils sont mis à jour chaque trimestre.

## Développement

```bash
python -m http.server 8642   # puis ouvrir http://localhost:8642
node test/tirage.test.mjs    # vérifie la logique de tirage
```

Après une modification des fichiers de l'app, changer `CACHE` dans `sw.js` (`russidge-v2`…) pour que les téléphones prennent la nouvelle version.
