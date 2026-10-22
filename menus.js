// Menus : répartit les ingrédients tirés en menus (protéine + féculent ou légumineuse + légume).
// Logique pure, sans DOM, testable avec node (voir test/menus.test.mjs). Prix en centimes.
// Un menu = { proteine: [noms], feculent: [noms], legume: [noms], cotes: [noms] }.
// `portion` = quantité par personne, dans l'unité de l'ingrédient ; sans portion, c'est un à-côté (un paquet).

import { relancer } from './tirage.js';

export const ROLES_MENU =['proteine', 'feculent', 'legume'];
const ROLE_CATEGORIE = {
  'Viandes et poissons': 'proteine', 'Œufs et laitages': 'proteine',
  'Féculents': 'feculent', 'Légumineuses': 'feculent',
  'Légumes': 'legume',
};

export function role(i) {
  return i.portion > 0 && ROLE_CATEGORIE[i.categorie] ? ROLE_CATEGORIE[i.categorie] : 'cote';
}

export function paquets(i, usages, personnes) {
  if (role(i) === 'cote') return 1;
  return Math.max(1, Math.ceil((i.portion * personnes * usages) / i.quantite));
}

// Pool pour tirage.js : chaque prix devient celui d'une portion de menu (temps 1 du tirage).
export function poolMenus(pool, personnes) {
  return Object.fromEntries(Object.entries(pool).map(([c, items]) =>
    [c, items.map((i) => ({ ...i, prix: paquets(i, 1, personnes) * i.prix }))]));
}

function usages(menus) {
  const u = new Map();
  for (const m of menus) for (const r of ROLES_MENU) for (const n of m[r]) u.set(n, (u.get(n) || 0) + 1);
  return u;
}

export function achats(menus, parNom, personnes) {
  const u = usages(menus);
  const out = new Map();
  for (const m of menus) {
    for (const n of [...ROLES_MENU.flatMap((r) => m[r]), ...m.cotes]) {
      if (!out.has(n) && parNom.has(n)) out.set(n, paquets(parNom.get(n), u.get(n) || 1, personnes));
    }
  }
  return out;
}

export function total(achatsMap, parNom) {
  let t = 0;
  for (const [n, p] of achatsMap) t += p * parNom.get(n).prix;
  return t;
}

export const incomplets = (menus) => menus.filter((m) => ROLES_MENU.some((r) => !m[r].length)).length;

// Oublie les noms absents de la base (ligne retirée du CSV depuis la sauvegarde).
export const nettoyer = (menus, parNom) => menus.map((m) =>
  Object.fromEntries(Object.entries(m).map(([r, noms]) => [r, noms.filter((n) => parNom.has(n))])));

const MANQUE = { proteine: 'aucune protéine tirée', feculent: 'aucun féculent ni légumineuse tiré', legume: 'aucun légume tiré' };

// Texte d'alerte des menus incomplets ('' si tous sont complets) : rôle jamais tiré, sinon budget trop juste.
export function alerte(menus, parNom) {
  const n = incomplets(menus);
  if (!n) return '';
  const tires = new Set(menus.flatMap((m) => ROLES_MENU.flatMap((r) => m[r].map((nom) => role(parNom.get(nom))))));
  const jamais = ROLES_MENU.filter((r) => !tires.has(r) && menus.some((m) => !m[r].length));
  const s = n > 1 ? 's' : '';
  return `${n} menu${s} sur ${menus.length} incomplet${s} : `
    + (jamais.length ? `${jamais.map((r) => MANQUE[r]).join(', ')}.` : 'le budget ne couvre pas une portion de plus.');
}

const copie = (menus) => menus.map((m) => ({ proteine: [...m.proteine], feculent: [...m.feculent], legume: [...m.legume], cotes: [...m.cotes] }));
const auHasard = (xs, rand) => xs[Math.floor(rand() * xs.length)];

// Temps 2 : distribue les ingrédients tirés à tour de rôle sur les menus (dans un ordre aléatoire),
// les à-côtés au hasard, puis complète les menus vides par des reprises tant que le budget le permet.
export function composer(noms, parNom, nbMenus, personnes, budget, rand = Math.random) {
  const menus = Array.from({ length: nbMenus }, () => ({ proteine: [], feculent: [], legume: [], cotes: [] }));
  const ordre = menus.map((_, i) => i);
  for (let i = ordre.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
  }
  const parRole = { proteine: [], feculent: [], legume: [], cote: [] };
  for (const n of noms) parRole[role(parNom.get(n))].push(n);
  for (const r of ROLES_MENU) parRole[r].forEach((n, j) => menus[ordre[j % nbMenus]][r].push(n));
  for (const n of parRole.cote) auHasard(menus, rand).cotes.push(n);
  return completer(menus, parNom, personnes, budget, rand);
}

// Déplace `nom` du menu a vers le menu b ; un ingrédient du même rôle de b (absent de a) fait le chemin inverse.
// Un à-côté se déplace seul. Si b a déjà `nom`, rien ne change.
export function echanger(menus, a, b, roleMenu, nom) {
  const out = copie(menus);
  if (a === b || out[b][roleMenu].includes(nom)) return out;
  out[a][roleMenu] = out[a][roleMenu].filter((n) => n !== nom);
  if (roleMenu !== 'cotes' && out[b][roleMenu].length) {
    const retour = out[b][roleMenu].find((n) => !out[a][roleMenu].includes(n));
    out[b][roleMenu] = out[b][roleMenu].filter((n) => n !== (retour ?? out[b][roleMenu][0]));
    if (retour) out[a][roleMenu].push(retour);
  }
  out[b][roleMenu].push(nom);
  return out;
}

// Produit sans portion d'une catégorie de menu (crème, beurre…) : il ne sort pas au tirage.
export const horsTirage = (i) => Boolean(ROLE_CATEGORIE[i.categorie]) && role(i) === 'cote';

// Relance chaque cible à part : celles sans remplaçant dans le budget sont gardées et listées dans `echecs`.
export function relancerChacun(pool, items, cibles, budget, rand = Math.random) {
  let courant = items;
  const echecs = [];
  for (const i of cibles) {
    const r = relancer(pool, courant, [i], budget, rand);
    if (r) courant = r; else echecs.push(i);
  }
  return { items: courant, echecs };
}

// Chaque nouveau nom prend la place de l'ancien, dans la case de son rôle (un ingrédient sans portion passe en à-côté).
export function substituer(menus, remplacements, parNom) {
  const cotesVus = new Set();
  return menus.map((m) => {
    const out = { proteine: [], feculent: [], legume: [], cotes: [] };
    for (const r of [...ROLES_MENU, 'cotes']) {
      for (const ancien of m[r]) {
        const n = remplacements.get(ancien) ?? ancien;
        const rn = role(parNom.get(n));
        if (rn === 'cote') {
          if (!cotesVus.has(n)) out.cotes.push(n); // un à-côté n'est que dans un menu
          cotesVus.add(n);
        } else if (!out[rn].includes(n)) out[rn].push(n); // pas deux fois le même ingrédient dans un menu
      }
    }
    return out;
  });
}

// ponytail: estimation (les moins chers de chaque catégorie, reprises au plus bas surcoût), pas un minimum garanti.
export function budgetComplet(pool, counts, nbMenus, personnes) {
  const pm = poolMenus(pool, personnes);
  const noms = Object.entries(counts).flatMap(([c, k]) =>
    [...(pm[c] || [])].sort((a, b) => a.prix - b.prix).slice(0, k).map((i) => i.nom));
  const parNom = new Map(Object.values(pool).flat().map((i) => [i.nom, i]));
  const menus = composer(noms, parNom, nbMenus, personnes, Infinity, () => 0);
  return incomplets(menus) ? Infinity : total(achats(menus, parNom, personnes), parNom);
}

// ponytail: remplissage glouton, pas optimal ; un autre ordre aurait pu compléter un menu de plus (choix assumé : garder le hasard).
export function completer(menus, parNom, personnes, budget, rand = Math.random) {
  const out = copie(menus);
  const cout = () => total(achats(out, parNom, personnes), parNom);

  // Réduire : tant que le budget est dépassé, retirer la dernière reprise (un paquet ne baisse parfois qu'après plusieurs retraits).
  while (cout() > budget) {
    const u = usages(out);
    let retire = false;
    for (let k = out.length - 1; k >= 0 && !retire; k--) {
      for (const r of ROLES_MENU) {
        let idx = out[k][r].length - 1; // (findLastIndex manque avant iOS 15.4)
        while (idx >= 0 && !(u.get(out[k][r][idx]) > 1)) idx--;
        if (idx >= 0) { out[k][r].splice(idx, 1); retire = true; break; }
      }
    }
    if (!retire) break;
  }

  // Compléter : chaque rôle vide reprend un ingrédient du même rôle, d'abord sans surcoût, sinon dans le budget restant.
  for (const m of out) {
    for (const r of ROLES_MENU) {
      if (m[r].length) continue;
      const u = usages(out);
      const t = cout();
      const candidats = [...u.keys()].filter((n) => role(parNom.get(n)) === r).map((n) => {
        const i = parNom.get(n);
        return { n, surcout: (paquets(i, u.get(n) + 1, personnes) - paquets(i, u.get(n), personnes)) * i.prix };
      }).sort((a, b) => a.surcout - b.surcout); // trié : avec rand = () => 0, on prend le moins cher (budgetComplet)
      const gratuits = candidats.filter((c) => c.surcout === 0);
      const possibles = gratuits.length ? gratuits : candidats.filter((c) => t + c.surcout <= budget);
      if (possibles.length) m[r].push(auHasard(possibles, rand).n);
    }
  }
  return out;
}
