// Lancer : node test/tirage.test.mjs
import assert from 'node:assert/strict';
import { budgetMinimum, tirer, relancer, tirerVarie } from '../tirage.js';

const ing = (nom, categorie, prix) => ({ nom, categorie, prix });
const pool = {
  V: [ing('a', 'V', 100), ing('b', 'V', 200), ing('c', 'V', 1000), ing('d', 'V', 50)],
  F: [ing('p', 'F', 90), ing('r', 'F', 300), ing('s', 'F', 120)],
};
const counts = { V: 2, F: 1 };

assert.equal(budgetMinimum(pool, counts), 50 + 100 + 90);
assert.equal(budgetMinimum(pool, { V: 5 }), Infinity); // pas assez d'ingrédients
assert.equal(tirer(pool, counts, 239), null); // un centime sous le minimum

for (let n = 0; n < 2000; n++) {
  const budget = 240 + Math.floor(Math.random() * 1200);
  const items = tirer(pool, counts, budget);
  assert.ok(items, `tirage impossible avec ${budget}`); // jamais d'impasse si le budget suffit
  assert.equal(items.filter((i) => i.categorie === 'V').length, 2);
  assert.equal(new Set(items.map((i) => i.nom)).size, items.length); // sans doublon
  assert.ok(items.reduce((s, i) => s + i.prix, 0) <= budget); // jamais au-dessus du budget

  const apres = relancer(pool, items, [0], budget);
  assert.ok(apres.reduce((s, i) => s + i.prix, 0) <= budget);
  assert.equal(new Set(apres.map((i) => i.nom)).size, apres.length);
  assert.equal(apres[0].categorie, items[0].categorie);
  assert.deepEqual(apres.slice(1), items.slice(1)); // le reste est gardé
}

// Au budget minimum, la seule combinaison possible sort.
const serre = tirer(pool, counts, 240).map((i) => i.nom).sort();
assert.deepEqual(serre, ['a', 'd', 'p']);

// Relance avec un remplaçant différent quand le budget le permet.
const base = [pool.V[0], pool.V[3], pool.F[0]]; // a, d, p = 240
assert.notEqual(relancer(pool, base, [0], 1000)[0].nom, 'a');

// Variété : les ingrédients récents sont évités quand c'est possible, jamais au prix d'un échec.
for (let n = 0; n < 500; n++) {
  assert.ok(!tirerVarie(pool, counts, 5000, new Set(['a'])).some((i) => i.nom === 'a'));
}
const petit = { V: [ing('a', 'V', 100), ing('b', 'V', 200)] };
assert.deepEqual(tirerVarie(petit, { V: 2 }, 5000, new Set(['a'])).map((i) => i.nom).sort(), ['a', 'b']); // pas assez sans récent
assert.deepEqual(tirerVarie(pool, counts, 240, new Set(['d'])).map((i) => i.nom).sort(), ['a', 'd', 'p']); // le budget l'exige
assert.equal(tirerVarie(pool, counts, 5000, new Set(['inconnu'])).length, 3);

console.log('tirage : OK');
