import test from 'ava';
import {
  parseBreedListWikitext,
  parseWikidataResults,
  findInWikidata,
  mergeBreedData,
} from '../scripts/update-breeds.js';

// -- Fixtures --

const sampleWikitext = `
== Extant breeds, varieties and types ==
=== A–C ===
{{columns-list|colwidth=20em|
* [[Affenpinscher]]{{sfnp|Fogle|2009|p=277}}
* [[Afghan Hound]]{{sfnp|Fogle|2009|p=107}}
* [[Akita (dog)|Akita]]{{sfnp|Fogle|2009|p=136}}
* [[Alaskan Malamute]]{{sfnp|Fogle|2009|p=122}}
}}

== Extinct and critically endangered breeds ==
* [[Alpine Spaniel]]
* [[Extinct Breed Two]]
`;

const sampleWikidataBindings = [
  {
    breedLabel: {value: 'Affenpinscher'},
    article: {value: 'https://en.wikipedia.org/wiki/Affenpinscher'},
    origins: {value: 'Germany'},
    image: {value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Affenpinscher.jpg'},
  },
  {
    breedLabel: {value: 'Afghan Hound'},
    article: {value: 'https://en.wikipedia.org/wiki/Afghan_Hound'},
    origins: {value: 'Afghanistan'},
    image: {value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Afghan_Hound.jpg'},
  },
  {
    breedLabel: {value: 'Akita'},
    article: {value: 'https://en.wikipedia.org/wiki/Akita_(dog_breed)'},
    origins: {value: 'Japan'},
    image: {value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Akita_inu.jpg'},
  },
  {
    breedLabel: {value: 'Alaskan Malamute'},
    article: {value: 'https://en.wikipedia.org/wiki/Alaskan_Malamute'},
    origins: {value: ''},
  },
];

// -- parseBreedListWikitext --

test('parseBreedListWikitext extracts breed names from wikitext', t => {
  const breeds = parseBreedListWikitext(sampleWikitext);
  t.is(breeds.size, 4);
  t.is(breeds.get('Affenpinscher'), 'Affenpinscher');
  t.is(breeds.get('Afghan Hound'), 'Afghan Hound');
  t.is(breeds.get('Alaskan Malamute'), 'Alaskan Malamute');
});

test('parseBreedListWikitext uses display name for piped links', t => {
  const breeds = parseBreedListWikitext(sampleWikitext);
  t.is(breeds.get('Akita (dog)'), 'Akita');
});

test('parseBreedListWikitext excludes extinct breeds', t => {
  const breeds = parseBreedListWikitext(sampleWikitext);
  t.false(breeds.has('Alpine Spaniel'));
  t.false(breeds.has('Extinct Breed Two'));
});

test('parseBreedListWikitext handles wikitext with no extinct section', t => {
  const wikitext = '* [[Beagle]]\n* [[Boxer (dog)|Boxer]]';
  const breeds = parseBreedListWikitext(wikitext);
  t.is(breeds.size, 2);
  t.is(breeds.get('Beagle'), 'Beagle');
  t.is(breeds.get('Boxer (dog)'), 'Boxer');
});

// -- parseWikidataResults --

test('parseWikidataResults parses SPARQL bindings into a map', t => {
  const breeds = parseWikidataResults(sampleWikidataBindings);
  t.is(breeds.size, 4);
  t.deepEqual(breeds.get('Affenpinscher'), {
    name: 'Affenpinscher',
    origin: 'Germany',
    imageURL: 'https://commons.wikimedia.org/wiki/Special:FilePath/Affenpinscher.jpg',
  });
});

test('parseWikidataResults converts http URLs to https', t => {
  const breeds = parseWikidataResults(sampleWikidataBindings);
  const {imageURL} = breeds.get('Afghan Hound');
  t.true(imageURL.startsWith('https://'));
  t.false(imageURL.startsWith('http://'));
});

test('parseWikidataResults decodes article titles with underscores', t => {
  const breeds = parseWikidataResults(sampleWikidataBindings);
  t.true(breeds.has('Afghan Hound'));
  t.true(breeds.has('Akita (dog breed)'));
  t.true(breeds.has('Alaskan Malamute'));
});

test('parseWikidataResults handles missing image gracefully', t => {
  const breeds = parseWikidataResults(sampleWikidataBindings);
  t.is(breeds.get('Alaskan Malamute').imageURL, '');
});

// -- findInWikidata --

test('findInWikidata returns breed by direct article title match', t => {
  const wikidataBreeds = parseWikidataResults(sampleWikidataBindings);
  const redirectMap = new Map();
  const result = findInWikidata('Affenpinscher', wikidataBreeds, redirectMap);
  t.is(result.name, 'Affenpinscher');
});

test('findInWikidata resolves via redirect map', t => {
  const wikidataBreeds = parseWikidataResults(sampleWikidataBindings);
  const redirectMap = new Map([['Akita (dog)', 'Akita (dog breed)']]);
  const result = findInWikidata('Akita (dog)', wikidataBreeds, redirectMap);
  t.is(result.name, 'Akita');
  t.is(result.origin, 'Japan');
});

test('findInWikidata returns undefined for unmatched breed', t => {
  const wikidataBreeds = parseWikidataResults(sampleWikidataBindings);
  const redirectMap = new Map();
  const result = findInWikidata('Nonexistent Breed', wikidataBreeds, redirectMap);
  t.is(result, undefined);
});

// -- mergeBreedData --

test('mergeBreedData combines Wikipedia and Wikidata data', t => {
  const wikipediaBreeds = parseBreedListWikitext(sampleWikitext);
  const wikidataBreeds = parseWikidataResults(sampleWikidataBindings);
  const redirectMap = new Map([['Akita (dog)', 'Akita (dog breed)']]);

  const merged = mergeBreedData(wikipediaBreeds, wikidataBreeds, redirectMap);
  t.is(merged.length, 4);

  const affenpinscher = merged.find(b => b.name === 'Affenpinscher');
  t.is(affenpinscher.origin, 'Germany');
  t.true(affenpinscher.imageURL.includes('Affenpinscher'));
});

test('mergeBreedData uses display names from Wikipedia, not Wikidata', t => {
  const wikipediaBreeds = parseBreedListWikitext(sampleWikitext);
  const wikidataBreeds = parseWikidataResults(sampleWikidataBindings);
  const redirectMap = new Map([['Akita (dog)', 'Akita (dog breed)']]);

  const merged = mergeBreedData(wikipediaBreeds, wikidataBreeds, redirectMap);
  const akita = merged.find(b => b.name === 'Akita');
  t.truthy(akita);
  t.is(akita.origin, 'Japan');
});

test('mergeBreedData includes unmatched breeds with empty fields', t => {
  const wikipediaBreeds = new Map([['Mystery Dog', 'Mystery Dog']]);
  const wikidataBreeds = new Map();
  const redirectMap = new Map();

  const merged = mergeBreedData(wikipediaBreeds, wikidataBreeds, redirectMap);
  t.is(merged.length, 1);
  t.deepEqual(merged[0], {name: 'Mystery Dog', origin: '', imageURL: ''});
});

test('mergeBreedData sorts results alphabetically', t => {
  const wikipediaBreeds = parseBreedListWikitext(sampleWikitext);
  const wikidataBreeds = parseWikidataResults(sampleWikidataBindings);
  const redirectMap = new Map([['Akita (dog)', 'Akita (dog breed)']]);

  const merged = mergeBreedData(wikipediaBreeds, wikidataBreeds, redirectMap);
  const names = merged.map(b => b.name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  t.deepEqual(names, sorted);
});
