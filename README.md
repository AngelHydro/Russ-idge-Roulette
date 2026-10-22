# Russ'idge Roulette

App mobile perso qui tire des ingrédients au hasard (par catégorie, sans dépasser un budget), les répartit en menus équilibrés et en fait une liste de courses.

C'est une app web installable (PWA) : une seule app pour Android et iPhone, sans store, qui marche hors connexion. Aucun serveur ni compte : chaque téléphone garde ses propres réglages et sa liste.

## Installer sur le téléphone

L'app doit être servie en HTTPS. Le plus simple est GitHub Pages :

1. Sur GitHub : *Settings → Pages → Deploy from a branch → `main` / `(root)`*.
2. Ouvrir l'adresse donnée (`https://<compte>.github.io/<dépôt>/`) sur le téléphone.
3. Android (Chrome) : menu ⋮ → *Ajouter à l'écran d'accueil*. iPhone (Safari) : bouton Partager → *Sur l'écran d'accueil*.

## Utilisation

Le parcours : Tirage → Menus → Liste.

- **Tirage** : nombre de menus et de personnes, nombre d'ingrédients par catégorie (− / +), budget (curseur par 5 €, ou tap sur le montant pour le saisir). Le budget minimum et celui qui permet de compléter tous les menus s'affichent en direct.
- **Menus** : chaque menu = une protéine, un féculent ou une légumineuse, un légume ; fruits, desserts, boissons et pain sont répartis en à-côtés. Un ingrédient peut resservir dans plusieurs menus si le budget le permet, sinon le menu reste incomplet et l'app le signale. Appui long = sélectionner, puis *Déplacer* (vers un autre menu), *Relancer*, *Relancer le reste* ou *Masquer*.
- **À racheter** (sur le Tirage) : lait, huile, sel… à ajouter à la main, avec des suggestions pendant la saisie. Leur prix est réservé dans le budget avant la roulette.
- **Liste** : regroupée par rayon, avec le nombre de paquets à acheter. Tap = cocher ; tap sur un prix = basculer paquet / kilo. On peut encore ajouter un article ; s'il fait dépasser le budget, la Liste l'indique et propose de relancer le tirage.
- **Variété** : le tirage évite les ingrédients des derniers tirages (réglable dans les Paramètres, de 0 à 3), sauf s'il ne peut pas faire autrement.
- **Paramètres** (⚙) : prix au paquet ou au kilo, son du clic, ingrédients masqués.

## Les ingrédients : `ingredients.csv`

Une ligne par produit, au format Excel français (séparateur `;`, virgule décimale) :

```
nom;categorie;rayon;prix;quantite;unite;portion
Lentilles vertes;Légumineuses;Épicerie;1,35;500;g;60
```

- `categorie` : une des 10 catégories de l'app (Viandes et poissons, Œufs et laitages, Légumineuses, Féculents, Légumes, Fruits, Surgelés, Desserts, Boulangerie, Boissons). Un produit surgelé va toujours dans Surgelés. La catégorie `Produits de base` (huile, sel, épices…) n'est jamais tirée : elle sert aux articles à racheter à la main.
- `prix` : prix du paquet en euros. `quantite` + `unite` (`g`, `ml` ou `pièce`) : contenu du paquet, qui sert au prix au kilo.
- `portion` : quantité par personne et par menu, dans la même unité (repères courants : 80 g de pâtes, 120 g de viande, 200 g de légumes). Elle sert à calculer le nombre de paquets. Vide = à-côté (fruits, desserts, beurre, crème…) : un paquet, hors de l'équilibre des menus.
- Les prix sont des repères Intermarché (octobre 2026), sans magasin précis : une partie est relevée, le reste estimé en attendant la prochaine mise à jour. Ils sont mis à jour chaque trimestre.
- Chaque type de produit a sa ligne (penne et coquillettes, tomates rondes et cocktail…) pour varier les tirages et garder un prix proche de ce qui est acheté ; pas de marques.

## Développement

```bash
python -m http.server 8642   # puis ouvrir http://localhost:8642
node test/tirage.test.mjs    # vérifie la logique de tirage
node test/menus.test.mjs     # vérifie la répartition en menus
```

Après une modification des fichiers de l'app, changer `CACHE` dans `sw.js` (`russidge-v2`…) pour que les téléphones prennent la nouvelle version.
