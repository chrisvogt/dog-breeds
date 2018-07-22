import test from 'ava';
import dogBreeds from '.';

test('random() returns a dog breed object', t => {
  const breed = dogBreeds.random();
  const expectedKeys = ['name', 'origin', 'imageURL'];
  t.true(typeof breed === 'object');
  t.deepEqual(Object.keys(breed), expectedKeys);
});

test('all() returns an array of dog breed objects', t => {
  t.true(Array.isArray(dogBreeds.all));
  t.true(typeof dogBreeds.all[0] === 'object');
});
