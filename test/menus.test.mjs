// Lancer : node test/menus.test.mjs
import assert from 'node:assert/strict';
import { tirer, budgetMinimum } from '../tirage.js';
import { role, paquets, poolMenus, achats, total, composer, completer, incomplets, echanger, substituer, budgetComplet } from '../menus.js';

const ing = (nom, categorie, quantite, prix, portion, unite = 'g') => ({ nom, categorie, quantite, prix, portion, unite });
const poulet = ing('poulet', 'Viandes et poissons', 300, 400, 120);
const riz = ing('riz', 'Féculents', 500, 160, 80);
const courgette = ing('courgette', 'Légumes', 500, 400, 200);
const carotte = ing('carotte', 'Légumes', 1500, 350, 200);
const banane = ing('banane', 'Fruits', 5, 260, NaN, 'pièce');
const creme = ing('creme', 'Œufs et laitages', 200, 150, NaN);
const parNom = new Map([poulet, riz, courgette, carotte, banane, creme].map((i) => [i.nom, i]));
const noms = (menus) => menus.flatMap((m) => [...m.proteine, ...m.feculent, ...m.legume, ...m.cotes]);
const cout = (menus, personnes) => total(achats(menus, parNom, personnes), parNom);

assert.equal(role(poulet), 'proteine');
assert.equal(role(riz), 'feculent');
assert.equal(role(courgette), 'legume');
assert.equal(role(banane), 'cote');
assert.equal(role(creme), 'cote'); // laitage sans portion = à-côté

assert.equal(paquets(poulet, 1, 2), 1); // 240 g ≤ 300 g
assert.equal(paquets(poulet, 2, 2), 2); // 480 g
assert.equal(paquets(banane, 3, 4), 1);
assert.equal(poolMenus({ V: [poulet] }, 6).V[0].prix, 3 * 400); // 720 g = 3 paquets
assert.equal(poulet.prix, 400); // le pool d'origine n'est pas modifié

// 2 menus, 2 personnes : le poulet doit resservir (+1 paquet = 400 c), le riz resert gratuitement.
const tous = ['poulet', 'riz', 'courgette', 'carotte', 'banane'];
const complets = composer(tous, parNom, 2, 2, 1970);
assert.equal(complets.length, 2);
assert.equal(incomplets(complets), 0);
assert.deepEqual([...new Set(noms(complets))].sort(), [...tous].sort()); // rien d'acheté pour rien
assert.equal(complets.filter((m) => m.legume.length).length, 2); // une courgette et une carotte, chacune dans un menu
assert.deepEqual(complets.flatMap((m) => m.cotes), ['banane']);
assert.equal(cout(complets, 2), 1970);

const serres = composer(tous, parNom, 2, 2, 1969); // 1 centime de moins : pas de 2e paquet de poulet
assert.equal(incomplets(serres), 1);
assert.ok(cout(serres, 2) <= 1969);

// Le budget n'est jamais dépassé, et chaque ingrédient tiré sert dans un menu.
const pool = {
  'Viandes et poissons': [poulet, ing('boeuf', 'Viandes et poissons', 250, 495, 120)],
  'Œufs et laitages': [creme, ing('oeufs', 'Œufs et laitages', 6, 210, 2, 'pièce')],
  'Féculents': [riz, ing('pates', 'Féculents', 500, 64, 80)],
  'Légumineuses': [ing('lentilles', 'Légumineuses', 500, 202, 60)],
  'Légumes': [courgette, carotte, ing('poireau', 'Légumes', 1000, 229, 200)],
  'Fruits': [banane],
};
const toutPool = new Map(Object.values(pool).flat().map((i) => [i.nom, i]));
for (let n = 0; n < 2000; n++) {
  const r = () => Math.floor(Math.random() * 3);
  const counts = { 'Viandes et poissons': r(), 'Œufs et laitages': r(), 'Féculents': r(), 'Légumineuses': r() % 2, 'Légumes': r() + 1, 'Fruits': r() % 2 };
  const nbMenus = 1 + Math.floor(Math.random() * 6);
  const personnes = 1 + Math.floor(Math.random() * 6);
  const budget = Math.floor(Math.random() * 8000);
  const tires = tirer(poolMenus(pool, personnes), counts, budget);
  if (!tires) continue;
  const menus = composer(tires.map((i) => i.nom), toutPool, nbMenus, personnes, budget);
  assert.ok(total(achats(menus, toutPool, personnes), toutPool) <= budget, `budget ${budget} dépassé`);
  for (const i of tires) assert.ok(noms(menus).includes(i.nom), `${i.nom} acheté pour rien`);
}

// Échanger : les rôles changent de menu, les achats ne bougent pas.
const avant = composer(tous, parNom, 2, 2, 1970);
const apres = echanger(avant, 0, 1, 'legume');
assert.deepEqual(apres[0].legume, avant[1].legume);
assert.deepEqual(apres[1].legume, avant[0].legume);
assert.deepEqual([...achats(apres, parNom, 2)].sort(), [...achats(avant, parNom, 2)].sort());

// Substituer : le poulet remplacé par de la crème (sans portion) passe en à-côté.
const sub = completer(substituer(avant, new Map([['poulet', 'creme']]), parNom), parNom, 2, 99999);
assert.ok(sub.every((m) => !m.proteine.includes('creme') && !m.proteine.includes('poulet')));
assert.ok(sub.some((m) => m.cotes.includes('creme')));
assert.equal(incomplets(sub), 2); // plus aucune protéine à reprendre
for (let n = 0; n < 500; n++) {
  const budget = 1570 + Math.floor(Math.random() * 1000); // ≥ coût d'une portion de chacun, comme garanti par tirer/relancer
  const m = completer(substituer(composer(tous, parNom, 3, 2, budget), new Map([['riz', 'carotte']]), parNom), parNom, 2, budget);
  assert.ok(cout(m, 2) <= budget);
}
// Un à-côté remplacé par un ingrédient à portion rejoint la case de son rôle.
const versRole = substituer([{ proteine: [], feculent: [], legume: [], cotes: ['creme'] }], new Map([['creme', 'poulet']]), parNom);
assert.deepEqual(versRole[0].proteine, ['poulet']);
assert.deepEqual(versRole[0].cotes, []);

// Budget « tous les menus complets ».
const poolSimple = { 'Viandes et poissons': [poulet], 'Féculents': [riz], 'Légumes': [courgette, carotte], 'Fruits': [banane] };
const countsSimple = { 'Viandes et poissons': 1, 'Féculents': 1, 'Légumes': 1, 'Fruits': 0 };
const bc = budgetComplet(poolSimple, countsSimple, 3, 2);
assert.ok(bc >= budgetMinimum(poolMenus(poolSimple, 2), countsSimple));
assert.equal(bc, 3 * 400 + 160 + 350); // poulet 3 × 240 g = 3 paquets ; riz 480 g et carotte 1,2 kg tiennent en 1 paquet
assert.equal(incomplets(composer(['poulet', 'riz', 'carotte'], parNom, 3, 2, bc)), 0);
assert.equal(budgetComplet(poolSimple, { 'Féculents': 1, 'Légumes': 1 }, 2, 1), Infinity); // pas de protéine

console.log('menus : OK');
