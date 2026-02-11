import test from 'ava';
import {all, random} from './index.js';

test('random() returns a dog breed object', t => {
  const breed = random();
  const expectedKeys = ['name', 'origin', 'imageURL'];
  t.true(typeof breed === 'object');
  t.deepEqual(Object.keys(breed), expectedKeys);
});

test('all is an array of dog breed objects', t => {
  t.true(Array.isArray(all));
  t.true(all.length > 0);
  t.true(typeof all[0] === 'object');
});
