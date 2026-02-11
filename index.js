import {readFileSync} from 'node:fs';
import uniqueRandomArray from 'unique-random-array';

const dogBreeds = JSON.parse(readFileSync(new URL('dog-breeds.json', import.meta.url), 'utf8'));

export const all = dogBreeds;
export const random = uniqueRandomArray(dogBreeds);
