// Menus : répartit les ingrédients tirés en menus (protéine + féculent ou légumineuse + légume).
// Logique pure, sans DOM, testable avec node (voir test/menus.test.mjs). Prix en centimes.
// Un menu = { proteine: [noms], feculent: [noms], legume: [noms], cotes: [noms] }.
// `portion` = quantité par personne, dans l'unité de l'ingrédient ; sans portion, c'est un à-côté (un paquet).

export const ROLES_MENU = ['proteine', 'feculent', 'legume'];
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

// ponytail: remplissage glouton, pas optimal ; un autre ordre aurait pu compléter un menu de plus (choix assumé : garder le hasard).
export function completer(menus, parNom, personnes, budget, rand = Math.random) {
  const out = copie(menus);
  const cout = () => total(achats(out, parNom, personnes), parNom);

  // Réduire : tant que le budget est dépassé, retirer la dernière reprise qui coûte quelque chose.
  for (let t = cout(); t > budget;) {
    let retire = false;
    for (let k = out.length - 1; k >= 0 && !retire; k--) {
      for (const r of ROLES_MENU) {
        const u = usages(out);
        const idx = out[k][r].findLastIndex((n) => u.get(n) > 1);
        if (idx < 0) continue;
        const [n] = out[k][r].splice(idx, 1);
        const apres = cout();
        if (apres < t) { t = apres; retire = true; break; }
        out[k][r].splice(idx, 0, n); // retrait gratuit : on la garde
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
      });
      const gratuits = candidats.filter((c) => c.surcout === 0);
      const possibles = gratuits.length ? gratuits : candidats.filter((c) => t + c.surcout <= budget);
      if (possibles.length) m[r].push(auHasard(possibles, rand).n);
    }
  }
  return out;
}
