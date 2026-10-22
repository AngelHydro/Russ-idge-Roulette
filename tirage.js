// Logique du tirage : pure, sans DOM, testable avec node (voir test/tirage.test.mjs).
// Les prix sont en centimes pour éviter les erreurs d'arrondi.
// `pool` = { categorie: [ingrédient non masqué, ...] }, un ingrédient = { nom, categorie, prix, ... }.

const somme = (xs) => xs.reduce((a, b) => a + b, 0);

// Prix des k ingrédients les moins chers d'une catégorie, hors `pris`. null si pas assez d'ingrédients.
function moinsChers(items, k, pris) {
  const prix = items.filter((i) => !pris.has(i.nom)).map((i) => i.prix).sort((a, b) => a - b);
  return prix.length < k ? null : prix.slice(0, k);
}

// Budget minimum pour remplir les catégories `cats` (une entrée par ingrédient à tirer).
function reserve(pool, cats, pris) {
  const parCat = {};
  for (const c of cats) parCat[c] = (parCat[c] || 0) + 1;
  let total = 0;
  for (const [c, k] of Object.entries(parCat)) {
    const prix = moinsChers(pool[c] || [], k, pris);
    if (!prix) return Infinity;
    total += somme(prix);
  }
  return total;
}

export function budgetMinimum(pool, counts) {
  const cats = Object.entries(counts).flatMap(([c, n]) => Array(n).fill(c));
  return reserve(pool, cats, new Set());
}

function melanger(xs, rand) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Remplit une case par catégorie de `cats`, sans doublon, sans dépasser `budget` avec `gardes`.
// Chaque choix est aléatoire parmi les ingrédients qui laissent encore de quoi remplir les cases restantes,
// donc on ne tombe jamais dans une impasse. Renvoie null si c'est impossible.
function remplir(pool, cats, gardes, budget, exclus, rand) {
  const pris = new Set([...exclus, ...gardes.map((i) => i.nom)]);
  let reste = budget - somme(gardes.map((i) => i.prix));
  const ordre = melanger(cats.map((_, i) => i), rand);
  const out = new Array(cats.length);
  for (let s = 0; s < ordre.length; s++) {
    const idx = ordre[s];
    const suivantes = ordre.slice(s + 1).map((i) => cats[i]);
    const candidats = (pool[cats[idx]] || []).filter((x) => {
      if (pris.has(x.nom) || x.prix > reste) return false;
      pris.add(x.nom);
      const ok = x.prix + reserve(pool, suivantes, pris) <= reste;
      pris.delete(x.nom);
      return ok;
    });
    if (!candidats.length) return null;
    const choix = candidats[Math.floor(rand() * candidats.length)];
    out[idx] = choix;
    pris.add(choix.nom);
    reste -= choix.prix;
  }
  return out;
}

// Tirage complet. Renvoie la liste d'ingrédients, ou null si le budget ne suffit pas.
export function tirer(pool, counts, budget, rand = Math.random) {
  const cats = Object.entries(counts).flatMap(([c, n]) => Array(n).fill(c));
  return remplir(pool, cats, [], budget, [], rand);
}

// Comme `tirer`, en évitant les noms de `recents` dans chaque catégorie qui en a assez d'autres ;
// si le budget ne passe pas sans eux, on retente avec tout (la variété est une préférence).
export function tirerVarie(pool, counts, budget, recents, rand = Math.random) {
  const varie = Object.fromEntries(Object.entries(pool).map(([c, items]) => {
    const autres = items.filter((i) => !recents.has(i.nom));
    return [c, autres.length >= (counts[c] || 0) ? autres : items];
  }));
  return tirer(varie, counts, budget, rand) || tirer(pool, counts, budget, rand);
}

// Relance les ingrédients aux positions `indices` : chacun est remplacé par un autre de sa catégorie.
// Si aucun remplaçant différent ne rentre dans le budget, on autorise de retomber sur les mêmes.
export function relancer(pool, items, indices, budget, rand = Math.random) {
  const cibles = new Set(indices);
  const gardes = items.filter((_, i) => !cibles.has(i));
  const cats = indices.map((i) => items[i].categorie);
  const anciens = indices.map((i) => items[i].nom);
  const nouveaux =
    remplir(pool, cats, gardes, budget, anciens, rand) || remplir(pool, cats, gardes, budget, [], rand);
  if (!nouveaux) return null;
  const out = [...items];
  indices.forEach((i, k) => (out[i] = nouveaux[k]));
  return out;
}
