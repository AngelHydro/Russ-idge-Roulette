import { budgetMinimum, tirer, relancer } from './tirage.js';

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
    liste: null, // [{ nom, coche }]
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
let ecranPrecedent = 'tirage';

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
    return { ...o, prix: Math.round(num(o.prix) * 100), quantite: num(o.quantite) };
  }).filter((i) => i.nom && i.prix >= 0 && i.quantite > 0);
}

function pool() {
  const masques = new Set(etat.masques);
  const p = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  for (const i of base) if (!masques.has(i.nom) && p[i.categorie]) p[i.categorie].push(i);
  return p;
}

// Réglages plafonnés au nombre d'ingrédients disponibles.
function countsEffectifs(p) {
  return Object.fromEntries(CATEGORIES.map((c) => [c, Math.min(etat.counts[c] || 0, p[c].length)]));
}

function articles() {
  return (etat.liste || []).filter((l) => parNom.has(l.nom));
}

function quantite(i) {
  const q = i.quantite;
  if (i.unite === 'g') return q >= 1000 ? `${nombre(q / 1000)} kg` : `${nombre(q)} g`;
  if (i.unite === 'ml') return q >= 1000 ? `${nombre(q / 1000)} L` : `${nombre(q / 10)} cl`;
  return `${nombre(q)} ${i.unite}${q > 1 && i.unite === 'pièce' ? 's' : ''}`;
}

function prixAffiche(i) {
  if (etat.prix !== 'kilo') return euros(i.prix);
  if (i.unite === 'g') return `${euros((i.prix * 1000) / i.quantite)}/kg`;
  if (i.unite === 'ml') return `${euros((i.prix * 1000) / i.quantite)}/L`;
  return `${euros(i.prix / i.quantite)}/${i.unite}`;
}

function afficher(nom) {
  if (nom !== ecranCourant && nom === 'parametres') ecranPrecedent = ecranCourant;
  ecranCourant = nom;
  for (const e of ['tirage', 'liste', 'parametres']) $(`#ecran-${e}`).hidden = e !== nom;
  ({ tirage: rendreTirage, liste: rendreListe, parametres: rendreParametres })[nom]();
  window.scrollTo(0, 0);
}

// ---------- Écran Tirage ----------

function rendreTirage() {
  const p = pool();
  const counts = countsEffectifs(p);
  $('#categories').innerHTML = CATEGORIES.map((c) => `
    <li class="${counts[c] ? '' : 'vide'}"><span>${esc(c)}</span>
      <span class="compteur">
        <button data-cat="${esc(c)}" data-delta="-1" aria-label="Moins : ${esc(c)}">−</button>
        <output>${counts[c]}</output>
        <button data-cat="${esc(c)}" data-delta="1" aria-label="Plus : ${esc(c)}">+</button>
      </span></li>`).join('');
  const champ = $('#budget-valeur');
  if (document.activeElement !== champ) champ.value = etat.budget / 100;
  ajusterChamp();
  $('#budget-curseur').value = Math.round(etat.budget / 100);

  const min = budgetMinimum(p, counts);
  const vide = somme(Object.values(counts)) === 0;
  const m = $('#minimum');
  m.textContent = !base.length ? 'Ingrédients introuvables (ingredients.csv)'
    : vide ? 'Choisis au moins un ingrédient'
    : `Minimum : ${euros(min)}`;
  m.classList.toggle('alerte', !base.length || vide || min > etat.budget);
}

$('#categories').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (!b) return;
  const p = pool();
  const c = b.dataset.cat;
  etat.counts[c] = Math.max(0, Math.min(p[c].length, countsEffectifs(p)[c] + Number(b.dataset.delta)));
  sauver();
  rendreTirage();
});

$('#budget-curseur').addEventListener('input', (e) => {
  etat.budget = Number(e.target.value) * 100;
  sauver();
  rendreTirage();
});

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
});

$('#lancer').addEventListener('click', () => {
  const p = pool();
  const counts = countsEffectifs(p);
  const items = tirer(p, counts, etat.budget);
  if (!items || !items.length) {
    rendreTirage();
    if (!items) $('#minimum').textContent = `Budget insuffisant : il faut au moins ${euros(budgetMinimum(p, counts))}`;
    return;
  }
  etat.liste = items.map((i) => ({ nom: i.nom, coche: false }));
  selection.clear();
  sauver();
  roulette(1500, () => { afficher('liste'); rendreListe(true); });
});

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
  b.style.setProperty('--duree', `${duree}ms`);
  b.classList.remove('tourne');
  r.hidden = false;
  void b.getBoundingClientRect(); // relance l'animation CSS
  b.classList.add('tourne');
  b.addEventListener('animationend', terminer, { once: true });
  r.addEventListener('click', terminer, { once: true });
  setTimeout(terminer, duree + 300); // si le navigateur ralentit l'animation, on ne reste pas bloqué
}

// ---------- Écran Liste ----------

const rang = (r) => (RAYONS.includes(r) ? RAYONS.indexOf(r) : RAYONS.length);

function rendreListe(anim = false) {
  const lignes = articles();
  const groupes = new Map();
  for (const l of lignes) {
    const r = parNom.get(l.nom).rayon;
    if (!groupes.has(r)) groupes.set(r, []);
    groupes.get(r).push(l);
  }
  let n = 0;
  $('#liste').innerHTML = [...groupes.keys()].sort((a, b) => rang(a) - rang(b)).map((r) =>
    `<div class="carte"><p class="surtitre">${esc(r)}</p>` + groupes.get(r).sort((a, b) => a.coche - b.coche).map((l) => {
      const i = parNom.get(l.nom);
      const classes = ['article', l.coche && 'coche', selection.has(l.nom) && 'choisi', anim && 'retourne'].filter(Boolean).join(' ');
      return `<div class="${classes}" data-nom="${esc(l.nom)}" style="--i:${n++}">
        <span>${esc(i.nom)} <span class="poids">· ${quantite(i)}</span></span>
        <span class="prix">${prixAffiche(i)}</span></div>`;
    }).join('') + '</div>',
  ).join('');

  const prix = (ls) => somme(ls.map((l) => parNom.get(l.nom).prix));
  $('#total').textContent = `${euros(prix(lignes))} / ${euros(etat.budget)}`;
  $('#reste').textContent = `Reste ${euros(prix(lignes.filter((l) => !l.coche)))}`;
  $('#actions').hidden = selection.size === 0;
}

function message(texte) {
  $('#message').textContent = texte;
  $('#message').hidden = !texte;
}

function basculerSelection(nom) {
  selection.has(nom) ? selection.delete(nom) : selection.add(nom);
  message('');
  rendreListe();
}

// Tap = cocher (ou ajuster la sélection en cours), appui long = sélectionner.
let appui = null;
const liste = $('#liste');
liste.addEventListener('pointerdown', (e) => {
  const a = e.target.closest('.article');
  if (!a) return;
  const courant = { nom: a.dataset.nom, x: e.clientX, y: e.clientY, long: false };
  courant.t = setTimeout(() => {
    courant.long = true;
    navigator.vibrate?.(15);
    basculerSelection(courant.nom);
  }, 500);
  appui = courant;
});
const annuler = () => { if (appui) clearTimeout(appui.t); appui = null; };
liste.addEventListener('pointermove', (e) => {
  if (appui && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 10) annuler();
});
liste.addEventListener('pointercancel', annuler);
liste.addEventListener('pointerup', () => {
  if (!appui) return;
  const { nom, long } = appui;
  annuler();
  if (long) return;
  if (selection.size) return basculerSelection(nom);
  const l = etat.liste.find((x) => x.nom === nom);
  l.coche = !l.coche;
  sauver();
  rendreListe();
});
liste.addEventListener('contextmenu', (e) => e.preventDefault());

$('#actions').addEventListener('click', (e) => {
  const action = e.target.closest('button')?.dataset.action;
  if (!action) return;
  const lignes = articles();
  const items = lignes.map((l) => parNom.get(l.nom));
  const cibles = items.map((_, i) => i).filter((i) => (action === 'reste') !== selection.has(items[i].nom));
  if (action === 'masquer') etat.masques.push(...selection);

  const nouveaux = cibles.length ? relancer(pool(), items, cibles, etat.budget) : items;
  if (nouveaux) {
    etat.liste = nouveaux.map((it, i) => ({ nom: it.nom, coche: cibles.includes(i) ? false : lignes[i].coche }));
  } else if (action === 'masquer') {
    etat.liste = lignes.filter((l) => !selection.has(l.nom));
  }
  selection.clear();
  sauver();
  if (nouveaux && cibles.length) roulette(400, rendreListe);
  else rendreListe();
  message(nouveaux ? '' : action === 'masquer'
    ? 'Masqué, mais aucun remplaçant ne rentre dans le budget'
    : 'Aucun remplaçant ne rentre dans le budget');
});

// Confirmation dans l'app (certains navigateurs intégrés bloquent confirm()) : 1er tap arme, 2e tap valide.
$('#nouveau').addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (!b.dataset.arme) {
    b.dataset.arme = '1';
    b.textContent = 'Remplacer la liste ? Toucher pour confirmer';
    b.classList.add('alerte');
    setTimeout(() => { delete b.dataset.arme; b.textContent = 'Nouveau tirage'; b.classList.remove('alerte'); }, 3000);
    return;
  }
  etat.liste = null;
  selection.clear();
  sauver();
  message('');
  afficher('tirage');
});

$('#partager').addEventListener('click', async () => {
  const lignes = articles();
  const texte = [...new Set(lignes.map((l) => parNom.get(l.nom).rayon))]
    .sort((a, b) => rang(a) - rang(b))
    .map((r) => `${r}\n` + lignes.filter((l) => parNom.get(l.nom).rayon === r)
      .map((l) => `${l.coche ? '✓' : '-'} ${l.nom} (${quantite(parNom.get(l.nom))})`).join('\n'))
    .join('\n\n') + `\n\nTotal : ${euros(somme(lignes.map((l) => parNom.get(l.nom).prix)))}`;
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
  $('#son').checked = etat.son;
  $('#masques').innerHTML = etat.masques.length
    ? etat.masques.map((n) => `<li><span>${esc(n)}</span><button data-nom="${esc(n)}">Démasquer</button></li>`).join('')
    : '<li class="discret">Aucun ingrédient masqué</li>';
}

document.querySelectorAll('input[name=prix]').forEach((r) =>
  r.addEventListener('change', () => { etat.prix = r.value; sauver(); }));
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
$('#retour').addEventListener('click', () => afficher(ecranPrecedent));

// ---------- Démarrage ----------

try {
  base = lireCSV(await (await fetch('ingredients.csv')).text());
} catch {
  base = [];
}
parNom = new Map(base.map((i) => [i.nom, i]));
appliquerTheme();
afficher(articles().length ? 'liste' : 'tirage');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
