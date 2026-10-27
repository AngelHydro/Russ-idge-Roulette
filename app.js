import { budgetMinimum, tirerVarie } from './tirage.js';
import {
  ROLES_MENU, paquets, poolMenus, achats, total, composer, completer, incomplets, echanger, substituer, budgetComplet, nettoyer, alerte, horsTirage, relancerChacun, coutAjouts, chercherProduit, produitsCommencantPar,
} from './menus.js';

const CATEGORIES = [
  'Viandes et poissons', 'Œufs et laitages', 'Légumineuses', 'Féculents', 'Légumes',
  'Fruits', 'Surgelés', 'Desserts', 'Boulangerie', 'Boissons',
];
const RAYONS = ['Fruits et légumes', 'Boucherie', 'Poissonnerie', 'Frais', 'Épicerie', 'Boulangerie', 'Surgelés', 'Boissons'];
const CLE = 'russidge-roulette';

// Tout l'état propre à ce téléphone, sauvé dans le navigateur. Prix en centimes.
const etat = Object.assign(
  {
    counts: { 'Viandes et poissons': 2, 'Œufs et laitages': 1, 'Légumineuses': 1, 'Féculents': 2, 'Légumes': 3, 'Fruits': 2 },
    budget: 4000,
    nbMenus: 4,
    personnes: 1,
    menus: null, // [{ proteine, feculent, legume, cotes }] (voir menus.js)
    liste: null, // [{ nom, coche }]
    ajouts: [], // noms à racheter à la main, un paquet chacun, réservés dans le budget
    historique: [], // noms tirés aux 3 derniers tirages, le plus récent en dernier
    variete: 2, // nombre de derniers tirages dont on évite les ingrédients (0 à 3)
    masques: [],
    prix: 'paquet',
    son: false,
    theme: 'auto', // auto | clair | sombre
  },
  lire(),
);

function lire() {
  try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return {}; }
}
function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch { /* stockage indisponible : l'app marche, sans mémoire */ }
}

let base = [];
let parNom = new Map();
const selection = new Set();
let ecranCourant = 'tirage';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const euros = (c) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const nombre = (n) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const somme = (xs) => xs.reduce((a, b) => a + b, 0);

// CSV au format Excel français : séparateur « ; », virgule décimale, BOM éventuel.
function lireCSV(texte) {
  const [entete, ...lignes] = texte.replace(/^﻿/, '').trim().split(/\r?\n/);
  const cols = entete.split(';').map((c) => c.trim());
  return lignes.filter((l) => l.trim()).map((l) => {
    const o = Object.fromEntries(l.split(';').map((v, i) => [cols[i], v.trim()]));
    const num = (v) => parseFloat(String(v).replace(',', '.'));
    return { ...o, prix: Math.round(num(o.prix) * 100), quantite: num(o.quantite), portion: num(o.portion) };
  }).filter((i) => i.nom && i.prix >= 0 && i.quantite > 0);
}

function pool() {
  const masques = new Set(etat.masques);
  const p = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  const ajouts = new Set(etat.ajouts);
  for (const i of base) if (!masques.has(i.nom) && !ajouts.has(i.nom) && p[i.categorie] && !horsTirage(i)) p[i.categorie].push(i);
  return p;
}

// Budget : les articles à racheter sont réservés d'avance, la roulette tire avec le reste.
const achatsMenus = () => (etat.menus ? achats(etat.menus, parNom, etat.personnes) : new Map());
const reserveAjouts = () => coutAjouts(etat.ajouts, parNom, new Map());
const budgetTirage = () => etat.budget - reserveAjouts();
const minimumTirage = (p = pool()) => budgetMinimum(poolMenus(p, etat.personnes), countsEffectifs(p)) + reserveAjouts();
const totalCourses = () => { const a = achatsMenus(); return total(a, parNom) + coutAjouts(etat.ajouts, parNom, a); };

// Réglages plafonnés au nombre d'ingrédients disponibles.
function countsEffectifs(p) {
  return Object.fromEntries(CATEGORIES.map((c) => [c, Math.min(etat.counts[c] || 0, p[c].length)]));
}

function articles() {
  return (etat.liste || []).filter((l) => parNom.has(l.nom));
}

function quantite(i) {
  const q = i.quantite;
  // Espaces insécables : « 400 g » ou « 2 × 500 g » ne se coupent pas en fin de ligne.
  if (i.unite === 'g') return q >= 1000 ? `${nombre(q / 1000)}\u00a0kg` : `${nombre(q)}\u00a0g`;
  if (i.unite === 'ml') return q >= 1000 ? `${nombre(q / 1000)}\u00a0L` : `${nombre(q / 10)}\u00a0cl`;
  return `${nombre(q)}\u00a0${i.unite}${q > 1 && i.unite === 'pièce' ? 's' : ''}`;
}

function prixAffiche(i) {
  if (etat.prix !== 'kilo') return euros(i.prix);
  if (i.unite === 'g') return `${euros((i.prix * 1000) / i.quantite)}/kg`;
  if (i.unite === 'ml') return `${euros((i.prix * 1000) / i.quantite)}/L`;
  return `${euros(i.prix / i.quantite)}/${i.unite}`;
}

// Chaque changement d'écran est une étape de l'historique : le bouton retour du téléphone y revient.
function afficher(nom, { historique = true } = {}) {
  if (historique && nom !== ecranCourant) history.pushState({ ecran: nom }, '');
  ecranCourant = nom;
  for (const e of ['tirage', 'menus', 'liste', 'parametres']) $(`#ecran-${e}`).hidden = e !== nom;
  rendre();
  window.scrollTo(0, 0);
}
// Redessine l'écran en cours sans changer la position dans la page.
const rendre = () => ({ tirage: rendreTirage, menus: rendreMenus, liste: rendreListe, parametres: rendreParametres })[ecranCourant]();

// Rejoue une animation CSS portée par `classe` (retirée une fois finie, pour pouvoir la relancer).
function animer(el, classe) {
  if (!el) return;
  el.classList.remove(classe);
  void el.offsetWidth;
  el.classList.add(classe);
  el.addEventListener('animationend', () => el.classList.remove(classe), { once: true });
}

// ---------- Écran Tirage ----------

const REGLAGES = { nbMenus: ['Menus', 1, 14], personnes: ['Personnes', 1, 8] };

function rendreTirage() {
  $('#semaine').textContent = semaine();
  const p = pool();
  const counts = countsEffectifs(p);
  $('#reglages-menus').innerHTML = Object.entries(REGLAGES).map(([cle, [nom]]) => `
    <li><span>${nom}</span>
      <span class="compteur">
        <button data-reglage="${cle}" data-delta="-1" aria-label="Moins : ${nom}">−</button>
        <output>${etat[cle]}</output>
        <button data-reglage="${cle}" data-delta="1" aria-label="Plus : ${nom}">+</button>
      </span></li>`).join('');
  $('#categories').innerHTML = CATEGORIES.map((c) => `
    <li class="${counts[c] ? '' : 'vide'}"><span>${esc(c)}</span>
      <span class="compteur">
        <button data-cat="${esc(c)}" data-delta="-1" aria-label="Moins : ${esc(c)}">−</button>
        <output>${counts[c]}</output>
        <button data-cat="${esc(c)}" data-delta="1" aria-label="Plus : ${esc(c)}">+</button>
      </span></li>`).join('');
  const champ = $('#budget-valeur');
  if (document.activeElement !== champ) champ.value = String(etat.budget / 100).replace('.', ',');
  ajusterChamp();
  const curseur = $('#budget-curseur');
  curseur.value = Math.round(etat.budget / 100);
  curseur.style.setProperty('--part', `${(curseur.value / curseur.max) * 100}%`);

  $('#racheter .ajouts').innerHTML = etat.ajouts.map((n) =>
    `<li><span>${esc(n)}</span><button data-retirer="${esc(n)}" aria-label="Retirer ${esc(n)}">✕</button></li>`).join('');

  const reserve = reserveAjouts();
  const min = minimumTirage(p);
  const complet = budgetComplet(p, counts, etat.nbMenus, etat.personnes) + reserve;
  const vide = somme(Object.values(counts)) === 0;
  const m = $('#minimum');
  m.textContent = !base.length ? 'Ingrédients introuvables (ingredients.csv)'
    : reserve > etat.budget ? `Les ajouts dépassent le budget (${euros(reserve)})`
    : vide ? 'Choisis au moins un ingrédient'
    : `Minimum : ${euros(min)}` + (complet > min && complet < Infinity ? ` · ${etat.nbMenus} menus complets à partir de ${euros(complet)}` : '');
  m.classList.toggle('alerte', !base.length || vide || min > etat.budget);
}

// ---------- Articles à racheter (Tirage et Liste) ----------

// Renvoie true si l'article est ajouté (le champ peut alors être vidé).
function ajouter(saisie) {
  if (!saisie.trim()) return false;
  const nom = chercherProduit(saisie, [...parNom.keys()]);
  if (!nom) return message(produitsCommencantPar(saisie, [...parNom.keys()]).length > 1 ? 'Plusieurs produits correspondent : précise' : 'Produit inconnu'), false;
  // Déjà acheté pour les menus : on ne le réserve pas une deuxième fois.
  if (achatsMenus().has(nom)) return message('Déjà dans la liste'), false;
  message('');
  if (!etat.ajouts.includes(nom)) etat.ajouts.push(nom);
  if (etat.liste) majListe();
  sauver();
  rendre();
  return true;
}

function retirer(nom) {
  etat.ajouts = etat.ajouts.filter((n) => n !== nom);
  if (etat.liste) majListe();
  sauver();
  rendre();
}

document.querySelectorAll('form.ajout').forEach((f) => f.addEventListener('submit', (e) => {
  e.preventDefault();
  if (ajouter(f.elements.ajout.value)) f.elements.ajout.value = '';
}));
$('#racheter .ajouts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-retirer]');
  if (b) retirer(b.dataset.retirer);
});

$('#reglages-menus').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-reglage]');
  if (!b) return;
  const [, mini, maxi] = REGLAGES[b.dataset.reglage];
  const avant = etat[b.dataset.reglage];
  etat[b.dataset.reglage] = Math.max(mini, Math.min(maxi, avant + Number(b.dataset.delta)));
  sauver();
  rendreTirage();
  if (etat[b.dataset.reglage] !== avant) rouler(`[data-reglage="${b.dataset.reglage}"]`, b.dataset.delta);
});

$('#categories').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (!b) return;
  const p = pool();
  const c = b.dataset.cat;
  const avant = countsEffectifs(p)[c];
  etat.counts[c] = Math.max(0, Math.min(p[c].length, avant + Number(b.dataset.delta)));
  sauver();
  rendreTirage();
  if (etat.counts[c] !== avant) rouler(`[data-cat="${CSS.escape(c)}"]`, b.dataset.delta);
});


// Le chiffre d'un compteur roule dans le sens du geste (le compteur vient d'être redessiné).
function rouler(selecteur, delta) {
  animer(document.querySelector(selecteur)?.parentElement.querySelector('output'), delta > 0 ? 'roule-haut' : 'roule-bas');
}

$('#budget-curseur').addEventListener('input', (e) => {
  etat.budget = Number(e.target.value) * 100;
  sauver();
  rendreTirage();
});
// Le cachet du budget est réimprimé quand on lâche le curseur (ou valide la saisie).
$('#budget-curseur').addEventListener('change', () => animer($('.montant'), 'reimprime'));

// Le champ du budget prend la largeur de son contenu, même pendant la saisie.
function ajusterChamp() {
  const champ = $('#budget-valeur');
  champ.style.width = `${Math.max(1, String(champ.value).length) + 0.2}ch`;
}
$('#budget-valeur').addEventListener('input', ajusterChamp);

$('#budget-valeur').addEventListener('change', (e) => {
  const v = parseFloat(String(e.target.value).replace(',', '.'));
  if (v >= 0) etat.budget = Math.round(v * 100);
  sauver();
  e.target.blur();
  rendreTirage();
  animer($('.montant'), 'reimprime');
});

// Tirage complet avec les réglages en cours. `remplace` : on refait le dernier tirage (il ne compte pas en plus dans
// l'historique). Renvoie false si le budget ne suffit pas.
function lancerTirage({ remplace = false } = {}) {
  const p = pool();
  const counts = countsEffectifs(p);
  const pm = poolMenus(p, etat.personnes);
  const reste = budgetTirage();
  const historique = remplace ? etat.historique.slice(0, -1) : etat.historique;
  const recents = new Set(etat.variete ? historique.slice(-etat.variete).flat() : []);
  const items = reste < 0 ? null : tirerVarie(pm, counts, reste, recents);
  if (!items || !items.length) {
    if (ecranCourant === 'tirage') rendreTirage();
    const texte = `Budget insuffisant : il faut au moins ${euros(minimumTirage(p))}`;
    if (items && ecranCourant !== 'tirage') message('Aucun ingrédient à tirer');
    else if (!items && ecranCourant === 'tirage') { $('#minimum').textContent = texte; $('#minimum').classList.add('alerte'); }
    else if (!items) message(texte);
    if (ecranCourant === 'tirage') $('.budget').scrollIntoView({ behavior: 'smooth', block: 'end' }); // scroll-margin : au-dessus du bouton collant
    return false;
  }
  const noms = items.map((i) => i.nom);
  etat.menus = composer(noms, parNom, etat.nbMenus, etat.personnes, reste);
  etat.historique = [...historique, noms].slice(-3);
  majListe();
  selection.clear();
  sauver();
  message('');
  roulette(1500, () => { afficher('menus'); rendreMenus({ imprime: true }); });
  return true;
}
// Maintenir pour tirer : le geste laisse un temps d'hésitation. Repli : deux taps rapprochés, ou Entrée / lecteur
// d'écran (clic sans pointeur, detail 0).
const MAINTIEN = 900; // ms, la durée de la jauge dans style.css
const boutonLancer = $('#lancer');
let maintien = null;
let tireParMaintien = false;
let dernierTap = -Infinity;
const relacher = () => { clearTimeout(maintien); boutonLancer.classList.remove('charge'); };
boutonLancer.addEventListener('pointerdown', (e) => {
  if (e.button) return;
  tireParMaintien = false;
  boutonLancer.classList.add('charge');
  maintien = setTimeout(() => { relacher(); tireParMaintien = true; lancerTirage(); }, MAINTIEN);
});
for (const t of ['pointerup', 'pointerleave', 'pointercancel']) boutonLancer.addEventListener(t, relacher);
boutonLancer.addEventListener('contextmenu', (e) => e.preventDefault());
boutonLancer.addEventListener('click', (e) => {
  if (tireParMaintien) { tireParMaintien = false; return; } // le clic qui suit le relâchement
  if (e.detail === 0 || e.timeStamp - dernierTap < 400) { dernierTap = -Infinity; lancerTirage(); return; }
  dernierTap = e.timeStamp;
});

// Numéro de semaine ISO, pour le cachet « Приказ № … » de l'en-tête.
function semaine(d = new Date()) {
  const j = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  j.setUTCDate(j.getUTCDate() + 4 - (j.getUTCDay() || 7));
  return Math.ceil(((j - Date.UTC(j.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

// La liste de courses suit les menus et les ajouts : un article par produit acheté, en gardant les coches.
function majListe() {
  const coches = new Set((etat.liste || []).filter((l) => l.coche).map((l) => l.nom));
  const noms = new Set([...achatsMenus().keys(), ...etat.ajouts.filter((n) => parNom.has(n))]);
  etat.liste = [...noms].map((nom) => ({ nom, coche: coches.has(nom) }));
}

// ---------- Animation ----------

function clic() {
  if (!etat.son) return;
  try {
    const ctx = (clic.ctx ||= new AudioContext());
    ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = 900;
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.06);
  } catch { /* pas de son, tant pis */ }
}

// Le barillet tourne `duree` ms (un tap l'arrête), puis clic + vibration, puis `fin`.
function roulette(duree, fin) {
  const r = $('#roulette');
  const b = r.querySelector('.barillet');
  let fini = false;
  const terminer = () => {
    if (fini) return;
    fini = true;
    r.hidden = true;
    b.classList.remove('tourne');
    navigator.vibrate?.(30);
    clic();
    fin();
  };
  $('#secret').textContent = String(semaine()).padStart(3, '0');
  b.style.setProperty('--duree', `${duree}ms`);
  b.classList.remove('tourne');
  r.hidden = false;
  void b.getBoundingClientRect(); // relance l'animation CSS
  b.classList.add('tourne');
  b.addEventListener('animationend', () => setTimeout(terminer, 250), { once: true }); // on voit le barillet calé
  r.addEventListener('click', terminer, { once: true });
  setTimeout(terminer, duree + 550); // si le navigateur ralentit l'animation, on ne reste pas bloqué
}

// ---------- Écran Liste ----------

const rang = (r) => (RAYONS.includes(r) ? RAYONS.indexOf(r) : RAYONS.length);

// Nombre de paquets par article (1 pour une liste faite avant les menus).
function nbPaquets() {
  const a = achatsMenus();
  return Object.assign((nom) => a.get(nom) || 1, { menus: a });
}
const qteArticle = (i, p) => (p > 1 ? `${p}\u00a0×\u00a0${quantite(i)}` : quantite(i));
const prixArticles = (lignes, pq) => somme(lignes.map((l) => pq(l.nom) * parNom.get(l.nom).prix));

function rendreListe() {
  const lignes = articles();
  const pq = nbPaquets();
  const groupes = new Map();
  for (const l of lignes) {
    const r = parNom.get(l.nom).rayon;
    if (!groupes.has(r)) groupes.set(r, []);
    groupes.get(r).push(l);
  }
  $('#liste').innerHTML = [...groupes.keys()].sort((a, b) => rang(a) - rang(b)).map((r) =>
    `<div class="carte"><p class="surtitre">${esc(r)}</p>` + groupes.get(r).sort((a, b) => a.coche - b.coche).map((l) => {
      const i = parNom.get(l.nom);
      const classes = ['article', l.coche && 'coche'].filter(Boolean).join(' ');
      const retirer = etat.ajouts.includes(l.nom) && !pq.menus.has(l.nom)
        ? ` <button class="retirer" data-retirer="${esc(l.nom)}" aria-label="Retirer ${esc(l.nom)}">✕</button>` : '';
      return `<div class="${classes}" data-nom="${esc(l.nom)}">
        <span>${esc(i.nom)} <span class="poids">·&nbsp;${qteArticle(i, pq(l.nom))}</span>${retirer}</span>
        <span class="prix">${etat.prix === 'kilo' ? prixAffiche(i) : euros(pq(l.nom) * i.prix)}</span></div>`;
    }).join('') + '</div>',
  ).join('');

  const totalListe = prixArticles(lignes, pq);
  $('#total').textContent = `${euros(totalListe)} / ${euros(etat.budget)}`;
  $('#reste').textContent = `Reste ${euros(prixArticles(lignes.filter((l) => !l.coche), pq))}`;
  $('#retour-menus').hidden = !etat.menus;
  // Un ajout fait après le tirage peut dépasser le budget : on le dit, et on propose de refaire le tirage.
  const depasse = totalListe - etat.budget;
  const ligne = $('#ligne-depassement');
  if (depasse > 0 && ligne.hidden) animer(ligne, 'imprime'); // la caisse imprime la ligne quand le budget saute
  ligne.hidden = depasse <= 0;
  $('#ligne-depassement b').textContent = `+${euros(depasse)}`;
  $('#total').classList.toggle('alerte', depasse > 0);
  $('#depassement').hidden = depasse <= 0;
  const relancable = etat.menus && minimumTirage() <= etat.budget;
  $('#depassement span').textContent = `${euros(depasse)} au-dessus du budget`
    + (etat.menus && !relancable ? ' : retire des articles ajoutés, aucun tirage ne rentre avec eux' : '');
  $('#rentrer').hidden = !relancable;
}

$('#rentrer').addEventListener('click', () => lancerTirage({ remplace: true }));

function message(texte) {
  for (const m of document.querySelectorAll('.message')) { m.textContent = texte; m.hidden = !texte; }
}

// Tap et appui long (500 ms) sur les éléments `selecteur` d'un conteneur, sans réagir au défilement.
function surAppui(conteneur, selecteur, { tap, long }) {
  let appui = null;
  const annuler = () => { if (appui) clearTimeout(appui.t); appui = null; };
  conteneur.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(selecteur);
    if (!el) return;
    const courant = { el, cible: e.target, x: e.clientX, y: e.clientY, long: false };
    // `long` renvoie false s'il ne traite pas l'appui : il reste alors un tap.
    if (long) courant.t = setTimeout(() => { if (long(el) !== false) { courant.long = true; navigator.vibrate?.(15); } }, 500);
    appui = courant;
  });
  conteneur.addEventListener('pointermove', (e) => {
    if (appui && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 10) annuler();
  });
  conteneur.addEventListener('pointercancel', annuler);
  conteneur.addEventListener('pointerup', () => {
    if (!appui) return;
    const { el, cible, long: fait } = appui;
    annuler();
    if (!fait) tap(el, cible);
  });
  conteneur.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Liste : un tap coche ou décoche ; sur le prix, il bascule paquet / kilo ; sur ✕, il retire l'ajout.
surAppui($('#liste'), '.article', {
  tap: (el, cible) => {
    const r = cible.closest('[data-retirer]');
    if (r) return retirer(r.dataset.retirer);
    if (cible.closest('.prix')) {
      etat.prix = etat.prix === 'kilo' ? 'paquet' : 'kilo';
      sauver();
      return rendreListe();
    }
    const l = etat.liste.find((x) => x.nom === el.dataset.nom);
    l.coche = !l.coche;
    sauver();
    rendreListe();
    // L'article a pu changer de place (cochés en bas) : on le retrouve pour tracer ou effacer le trait.
    animer($(`#liste .article[data-nom="${CSS.escape(l.nom)}"]`), l.coche ? 'trace' : 'efface');
  },
});

$('#retour-menus').addEventListener('click', () => retourner('menus'));

// ---------- Écran Menus ----------

// Sélection = occurrences « menu|rôle|nom ». `deplacement` = l'occurrence à déplacer, en attente du menu cible.
let deplacement = null;
const cleOcc = (k, r, nom) => `${k}|${r}|${nom}`;
const LIBELLES = { proteine: 'Protéine', legume: 'Légume' };
const libelle = (r, m) => LIBELLES[r]
  || (m.feculent.length && m.feculent.every((n) => parNom.get(n)?.categorie === 'Légumineuses') ? 'Légumineuse' : 'Féculent');

// `imprime` : le ticket sort de la caisse (arrivée d'un tirage) ; `tapes` : noms à taper à la machine (remplaçants).
function rendreMenus({ imprime = false, tapes = new Set() } = {}) {
  const menus = etat.menus || [];
  const occ = (k, r, nom) => `<span class="occ${selection.has(cleOcc(k, r, nom)) ? ' choisi' : ''}${tapes.has(nom) ? ' tape' : ''}"
    style="--n:${nom.length}" data-menu="${k}" data-role="${r}" data-nom="${esc(nom)}">${esc(nom)}</span>`;
  $('#cachet-semaine').textContent = semaine();
  $('#menus-surtitre').textContent = `${menus.length} menu${menus.length > 1 ? 's' : ''} · ${etat.personnes} personne${etat.personnes > 1 ? 's' : ''}`;
  $('#menus').innerHTML = menus.map((m, k) => {
    const cible = deplacement && deplacement.menu !== k ? ' cible' : '';
    return `<div class="carte menu${cible}" data-menu="${k}">
      <h2>Menu ${k + 1}</h2>
      ${ROLES_MENU.map((r) => `<div class="r"><span>${libelle(r, m)}</span><span>${
        m[r].length ? m[r].map((n) => occ(k, r, n)).join(', ') : '<span class="manque">manquant</span>'}</span></div>`).join('')}
      ${m.cotes.length ? `<div class="cotes">+ ${m.cotes.map((n) => occ(k, 'cotes', n)).join(', ')}</div>` : ''}
    </div>`;
  }).join('');

  $('#alerte-menus').textContent = alerte(menus, parNom);
  $('#alerte-menus').hidden = !incomplets(menus);

  $('#total-menus').textContent = `${euros(totalCourses())} / ${euros(etat.budget)}`;
  $('#actions').hidden = selection.size === 0 || !!deplacement;
  if (imprime) animer($('#ticket-menus'), 'imprime');
}

// Une fois tapé, le nom peut de nouveau passer à la ligne (sinon un nom long est coupé sur un petit écran).
$('#menus').addEventListener('animationend', (e) => e.target.classList.remove('tape'));

function basculerOccurrence(el) {
  const c = cleOcc(el.dataset.menu, el.dataset.role, el.dataset.nom);
  selection.has(c) ? selection.delete(c) : selection.add(c);
  deplacement = null;
  message('');
  rendreMenus();
}

surAppui($('#menus'), '.occ, .menu', {
  // Pendant un déplacement, ou hors d'un ingrédient, un appui long compte comme un tap.
  long: (el) => {
    if (deplacement || !el.classList.contains('occ')) return false;
    basculerOccurrence(el);
  },
  tap: (el) => {
    const carte = el.closest('.menu');
    if (deplacement && carte) return deplacerVers(Number(carte.dataset.menu));
    if (selection.size && el.classList.contains('occ')) basculerOccurrence(el);
  },
});

function deplacerVers(k) {
  const { menu, role: r, nom } = deplacement;
  deplacement = null;
  if (k !== menu) {
    etat.menus = echanger(etat.menus, menu, k, r, nom);
    majListe(); // un ingrédient déjà présent dans le menu cible peut libérer un paquet
    sauver();
  }
  selection.clear();
  message('');
  rendreMenus();
}

$('#actions').addEventListener('click', (e) => {
  const action = e.target.closest('button')?.dataset.action;
  if (!action) return;
  const choisis = [...selection].map((c) => { const [menu, r, ...nom] = c.split('|'); return { menu: Number(menu), role: r, nom: nom.join('|') }; });

  if (action === 'deplacer') {
    if (choisis.length !== 1) return message('Sélectionne un seul ingrédient à déplacer');
    deplacement = choisis[0];
    rendreMenus();
    return message('Touche le menu où le mettre');
  }

  // Relancer / Relancer le reste / Masquer : les ingrédients visés sont barrés à l'encre, puis les remplaçants
  // prennent leur place, dans les mêmes menus, tapés à la machine.
  const vises = action === 'reste' ? '.occ:not(.choisi)' : '.occ.choisi';
  document.querySelectorAll(`#menus ${vises}`).forEach((el) => el.classList.add('raye'));
  $('#actions').hidden = true;
  selection.clear(); // `choisis` est déjà pris : un tap pendant le barré ne peut plus relancer une seconde fois
  setTimeout(() => appliquer(action, choisis), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350);
});

function appliquer(action, choisis) {
  const nomsChoisis = new Set(choisis.map((c) => c.nom));
  const noms = [...achats(etat.menus, parNom, etat.personnes).keys()];
  const items = noms.map((n) => ({ ...parNom.get(n), prix: paquets(parNom.get(n), 1, etat.personnes) * parNom.get(n).prix }));
  const cibles = noms.map((_, i) => i).filter((i) => (action === 'reste') !== nomsChoisis.has(noms[i]));
  if (action === 'masquer') etat.masques.push(...nomsChoisis);

  // Chaque cible est relancée à part : une sans remplaçant n'empêche pas les autres.
  const { items: nouveaux, echecs } = relancerChacun(poolMenus(pool(), etat.personnes), items, cibles, budgetTirage());
  const remplaces = cibles.filter((i) => !echecs.includes(i) && nouveaux[i].nom !== noms[i]);
  const retires = new Set(action === 'masquer' ? echecs.map((i) => noms[i]) : []); // masqués sans remplaçant : on les enlève
  const garder = (ns) => ns.filter((n) => !retires.has(n));
  const menus = substituer(etat.menus, new Map(remplaces.map((i) => [noms[i], nouveaux[i].nom])), parNom)
    .map((m) => ({ proteine: garder(m.proteine), feculent: garder(m.feculent), legume: garder(m.legume), cotes: garder(m.cotes) }));
  etat.menus = completer(menus, parNom, etat.personnes, budgetTirage());
  // Un article remplacé est un nouvel article : il repart décoché.
  etat.liste = (etat.liste || []).filter((l) => !remplaces.some((i) => noms[i] === l.nom));
  majListe();
  selection.clear();
  sauver();
  rendreMenus({ tapes: new Set(remplaces.map((i) => nouveaux[i].nom)) });
  const n = echecs.length;
  message(!n ? '' : `${n} ingrédient${n > 1 ? 's' : ''} sans remplaçant dans le budget${action === 'masquer' ? ' (masqué' + (n > 1 ? 's' : '') + ' quand même)' : ''}`);
}

$('#voir-liste').addEventListener('click', () => { selection.clear(); deplacement = null; message(''); retourner('liste'); });

// Menus ⇄ liste : le ticket pivote d'un quart de tour, l'écran change, le verso finit le tour.
// Comme pour le barillet, un délai de secours : si l'animation ne se termine pas, on change d'écran quand même.
function retourner(vers) {
  const depart = $(`#ticket-${vers === 'liste' ? 'menus' : 'liste'}`);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !depart.offsetParent) return afficher(vers);
  let fait = false;
  const ecran = ecranCourant;
  // Une animation d'un enfant (nom tapé à la machine) remonte aussi ici : seule celle du ticket compte.
  const arrivee = (e) => {
    if (fait || (e && e.target !== depart)) return;
    fait = true;
    depart.removeEventListener('animationend', arrivee);
    depart.classList.remove('pivote-sortie');
    if (ecranCourant !== ecran) return; // retour système pendant le pivot : on reste où il a mené
    afficher(vers);
    const t = $(`#ticket-${vers}`);
    if (!t.offsetParent) return; // ticket masqué (liste vide) : rien à animer
    t.classList.add('pivote-entree');
    const fin = () => t.classList.remove('pivote-entree');
    t.addEventListener('animationend', fin, { once: true });
    setTimeout(fin, 500);
  };
  depart.classList.add('pivote-sortie');
  depart.addEventListener('animationend', arrivee);
  setTimeout(arrivee, 400);
}

// Confirmation dans l'app (certains navigateurs intégrés bloquent confirm()) : 1er tap arme, 2e tap valide.
let armeNouveau = null;
function desarmerNouveau() {
  clearTimeout(armeNouveau);
  armeNouveau = null;
  $('#nouveau').textContent = 'Nouveau tirage';
  $('#nouveau').classList.remove('alerte');
}
$('#nouveau').addEventListener('click', (e) => {
  if (!armeNouveau) {
    e.currentTarget.textContent = 'Remplacer la liste ? Toucher pour confirmer';
    e.currentTarget.classList.add('alerte');
    armeNouveau = setTimeout(desarmerNouveau, 3000);
    return;
  }
  desarmerNouveau(); // sinon le tirage suivant pourrait être effacé d'un seul tap
  etat.liste = null;
  etat.menus = null;
  etat.ajouts = [];
  selection.clear();
  sauver();
  message('');
  afficher('tirage');
});

$('#partager').addEventListener('click', async () => {
  const lignes = articles();
  const pq = nbPaquets();
  const texte = [...new Set(lignes.map((l) => parNom.get(l.nom).rayon))]
    .sort((a, b) => rang(a) - rang(b))
    .map((r) => `${r}\n` + lignes.filter((l) => parNom.get(l.nom).rayon === r)
      .map((l) => `${l.coche ? '✓' : '-'} ${l.nom} (${qteArticle(parNom.get(l.nom), pq(l.nom))})`).join('\n'))
    .join('\n\n') + `\n\nTotal : ${euros(prixArticles(lignes, pq))}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Liste de courses', text: texte });
    else { await navigator.clipboard.writeText(texte); message('Liste copiée'); }
  } catch { /* partage annulé */ }
});

// ---------- Écran Paramètres ----------

function appliquerTheme() {
  const racine = document.documentElement;
  if (etat.theme === 'auto') delete racine.dataset.theme;
  else racine.dataset.theme = etat.theme;
  document.querySelector('meta[name=theme-color]').content = getComputedStyle(racine).getPropertyValue('--fond').trim();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', appliquerTheme);

function rendreParametres() {
  document.querySelector(`input[name=theme][value=${etat.theme}]`).checked = true;
  document.querySelector(`input[name=prix][value=${etat.prix}]`).checked = true;
  document.querySelector(`input[name=variete][value="${etat.variete}"]`).checked = true;
  $('#son').checked = etat.son;
  $('#masques').innerHTML = etat.masques.length
    ? etat.masques.map((n) => `<li><span>${esc(n)}</span><button data-nom="${esc(n)}">Démasquer</button></li>`).join('')
    : '<li class="discret">Aucun ingrédient masqué</li>';
}

document.querySelectorAll('input[name=prix]').forEach((r) =>
  r.addEventListener('change', () => { etat.prix = r.value; sauver(); }));
document.querySelectorAll('input[name=variete]').forEach((r) =>
  r.addEventListener('change', () => { etat.variete = Number(r.value); sauver(); }));
document.querySelectorAll('input[name=theme]').forEach((r) =>
  r.addEventListener('change', () => { etat.theme = r.value; sauver(); appliquerTheme(); }));
$('#son').addEventListener('change', (e) => {
  etat.son = e.target.checked;
  sauver();
  clic();
});
$('#masques').addEventListener('click', (e) => {
  const nom = e.target.closest('button')?.dataset.nom;
  if (nom == null) return;
  etat.masques = etat.masques.filter((m) => m !== nom);
  sauver();
  rendreParametres();
});

document.querySelectorAll('[data-ecran]').forEach((b) => b.addEventListener('click', () => afficher(b.dataset.ecran)));
$('#retour').addEventListener('click', () => history.back());

// Retour du téléphone. Un écran qui n'a plus lieu d'être est sauté : la liste et les menus d'un tirage effacé,
// et le Tirage tant qu'une liste est en cours (le remplacer passe par « Nouveau tirage », avec confirmation).
const enCours = () => Boolean(etat.menus || articles().length);
const possible = { tirage: () => !enCours(), menus: () => Boolean(etat.menus), liste: () => articles().length > 0, parametres: () => true };
addEventListener('popstate', (e) => {
  const nom = e.state?.ecran;
  if (!possible[nom]) return;
  if (!possible[nom]() || nom === ecranCourant) return history.back(); // déjà sur cet écran : un retour de plus
  selection.clear();
  deplacement = null;
  message('');
  afficher(nom, { historique: false });
});

// ---------- Démarrage ----------

appliquerTheme();
try {
  const octets = await (await fetch('ingredients.csv')).arrayBuffer();
  let texte = new TextDecoder().decode(octets);
  // Réenregistré depuis Excel, le fichier est souvent en Windows-1252 : les accents deviennent illisibles en UTF-8.
  if (texte.includes('\uFFFD')) texte = new TextDecoder('windows-1252').decode(octets);
  base = lireCSV(texte);
} catch {
  base = [];
}
parNom = new Map(base.map((i) => [i.nom, i]));
if (base.length) {
  if (etat.menus) etat.menus = nettoyer(etat.menus, parNom);
  etat.masques = etat.masques.filter((n) => parNom.has(n));
  etat.ajouts = etat.ajouts.filter((n) => parNom.has(n));
  sauver();
}
// Suggestions pendant la saisie d'un article à racheter : tous les produits du fichier.
$('#suggestions').innerHTML = base.map((i) => i.nom).sort((a, b) => a.localeCompare(b, 'fr'))
  .map((n) => `<option value="${esc(n)}"></option>`).join('');
ecranCourant = articles().length ? 'liste' : 'tirage';
history.replaceState({ ecran: ecranCourant }, '');
afficher(ecranCourant, { historique: false });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
