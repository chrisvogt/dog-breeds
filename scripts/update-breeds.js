#!/usr/bin/env node

/**
 * Fetches the current list of dog breeds from Wikipedia + Wikidata and writes
 * an updated dog-breeds.json.
 *
 * Data sources:
 *   1. Wikipedia "List of dog breeds" – canonical list of extant breed names
 *   2. Wikidata SPARQL – structured origin + image data for each breed
 *
 * Usage:
 *   node scripts/update-breeds.js
 *
 * No dependencies required – uses built-in fetch (Node 18+).
 */

import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'dog-breeds-updater/1.0 (https://github.com/chrisvogt/dog-breeds)';

const SPARQL_QUERY = `
SELECT ?breed ?breedLabel ?article
  (GROUP_CONCAT(DISTINCT ?originLabel; separator=", ") AS ?origins)
  (SAMPLE(?img) AS ?image)
WHERE {
  ?breed wdt:P31 wd:Q39367 .
  ?breed rdfs:label ?breedLabel . FILTER(LANG(?breedLabel) = "en")
  ?article schema:about ?breed ; schema:isPartOf <https://en.wikipedia.org/> .
  OPTIONAL {
    ?breed wdt:P495 ?origin .
    ?origin rdfs:label ?originLabel . FILTER(LANG(?originLabel) = "en")
  }
  OPTIONAL { ?breed wdt:P18 ?img . }
}
GROUP BY ?breed ?breedLabel ?article
ORDER BY ?breedLabel
`;

/**
 * Fetch the wikitext of the "List of dog breeds" page and parse out
 * extant breed names with their Wikipedia article titles.
 *
 * @returns {Map<string, string>} article title → display name
 */
async function fetchWikipediaBreedList() {
  console.log('Fetching Wikipedia "List of dog breeds" page...');

  const url = new URL(WIKIPEDIA_API);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', 'List_of_dog_breeds');
  url.searchParams.set('prop', 'wikitext');
  url.searchParams.set('format', 'json');

  const response = await fetch(url, {headers: {'User-Agent': USER_AGENT}});
  const data = await response.json();
  const wikitext = data.parse.wikitext['*'];

  // Only take breeds from the "Extant" section (before "Extinct" section)
  const extinctIndex = wikitext.indexOf('== Extinct');
  const extantText = extinctIndex > 0 ? wikitext.slice(0, extinctIndex) : wikitext;

  // Match bullet-list wiki links: * [[Article Title]] or * [[Article Title|Display Name]]
  const linkPattern = /\*\s*\[\[([^\]|]+?)(?:\|([^\]]+?))?]]/g;
  const breeds = new Map();

  for (const match of extantText.matchAll(linkPattern)) {
    const articleTitle = match[1].trim();
    const displayName = (match[2] || match[1]).trim();
    if (!breeds.has(articleTitle)) {
      breeds.set(articleTitle, displayName);
    }
  }

  console.log(`  Found ${breeds.size} extant breeds on Wikipedia.`);
  return breeds;
}

/**
 * Resolve Wikipedia redirects for a batch of article titles.
 *
 * @param {string[]} batch - Up to 50 article titles
 * @returns {Map<string, string>} original title → resolved (canonical) title
 */
async function resolveRedirectBatch(batch) {
  const url = new URL(WIKIPEDIA_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', batch.join('|'));
  url.searchParams.set('redirects', '1');
  url.searchParams.set('format', 'json');

  const response = await fetch(url, {headers: {'User-Agent': USER_AGENT}});
  const data = await response.json();

  const normalized = new Map();
  if (data.query.normalized) {
    for (const n of data.query.normalized) {
      normalized.set(n.from, n.to);
    }
  }

  const redirects = new Map();
  if (data.query.redirects) {
    for (const r of data.query.redirects) {
      redirects.set(r.from, r.to);
    }
  }

  const result = new Map();
  for (const title of batch) {
    let resolved = title;

    if (normalized.has(resolved)) {
      resolved = normalized.get(resolved);
    }

    if (redirects.has(resolved)) {
      resolved = redirects.get(resolved);
    }

    if (resolved !== title) {
      result.set(title, resolved);
    }
  }

  return result;
}

/**
 * Resolve Wikipedia redirects for article titles.
 * The MediaWiki API accepts up to 50 titles per request.
 *
 * @param {string[]} titles - Article titles to resolve
 * @returns {Map<string, string>} original title → resolved (canonical) title
 */
async function resolveRedirects(titles) {
  const batchSize = 50;
  const batches = [];

  for (let i = 0; i < titles.length; i += batchSize) {
    batches.push(titles.slice(i, i + batchSize));
  }

  const results = await Promise.all(batches.map(batch => resolveRedirectBatch(batch)));

  const redirectMap = new Map();
  for (const batchResult of results) {
    for (const [from, to] of batchResult) {
      redirectMap.set(from, to);
    }
  }

  return redirectMap;
}

/**
 * Query Wikidata for all dog breeds with origin and image data.
 *
 * @returns {Map<string, object>} Wikipedia article title → breed data
 */
async function fetchWikidataBreedInfo() {
  console.log('Querying Wikidata for breed origins and images...');

  const url = new URL(WIKIDATA_SPARQL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('query', SPARQL_QUERY);

  const response = await fetch(url, {headers: {'User-Agent': USER_AGENT}});
  const data = await response.json();

  const breeds = new Map();
  for (const result of data.results.bindings) {
    // Extract the article title from the full Wikipedia URL
    const articleUrl = result.article.value;
    const articleTitle = decodeURIComponent(articleUrl.split('/wiki/')[1]).replaceAll('_', ' ');

    // Wikidata returns http:// URLs; convert to https://
    const imageURL = (result.image?.value || '').replace('http://', 'https://');

    breeds.set(articleTitle, {
      name: result.breedLabel.value,
      origin: result.origins?.value || '',
      imageURL,
    });
  }

  console.log(`  Found ${breeds.size} breeds with Wikipedia articles in Wikidata.`);
  return breeds;
}

/**
 * Look up a breed in the Wikidata map, trying the original title first,
 * then the resolved redirect target.
 */
function findInWikidata(articleTitle, wikidataBreeds, redirectMap) {
  if (wikidataBreeds.has(articleTitle)) {
    return wikidataBreeds.get(articleTitle);
  }

  const resolved = redirectMap.get(articleTitle);
  if (resolved && wikidataBreeds.has(resolved)) {
    return wikidataBreeds.get(resolved);
  }

  return undefined;
}

/**
 * Combine Wikipedia breed list with Wikidata metadata.
 */
function mergeBreedData(wikipediaBreeds, wikidataBreeds, redirectMap) {
  const merged = [];
  let matchCount = 0;
  let missingOrigin = 0;
  let missingImage = 0;
  const unmatched = [];

  for (const [articleTitle, displayName] of wikipediaBreeds) {
    const wikidataEntry = findInWikidata(articleTitle, wikidataBreeds, redirectMap);

    if (wikidataEntry) {
      matchCount++;
      const entry = {
        name: displayName,
        origin: wikidataEntry.origin,
        imageURL: wikidataEntry.imageURL,
      };

      if (!entry.origin) {
        missingOrigin++;
      }

      if (!entry.imageURL) {
        missingImage++;
      }

      merged.push(entry);
    } else {
      unmatched.push(displayName);
      missingOrigin++;
      missingImage++;
      merged.push({
        name: displayName,
        origin: '',
        imageURL: '',
      });
    }
  }

  merged.sort((a, b) => a.name.localeCompare(b.name));

  console.log('\nMerge results:');
  console.log(`  Total breeds: ${merged.length}`);
  console.log(`  Matched in Wikidata: ${matchCount}`);
  console.log(`  Not found in Wikidata: ${unmatched.length}`);
  console.log(`  Missing origin: ${missingOrigin}`);
  console.log(`  Missing image: ${missingImage}`);

  if (unmatched.length > 0) {
    console.log('\nBreeds not found in Wikidata:');
    for (const name of unmatched.sort()) {
      console.log(`  - ${name}`);
    }
  }

  return merged;
}

const [wikipediaBreeds, wikidataBreeds] = await Promise.all([
  fetchWikipediaBreedList(),
  fetchWikidataBreedInfo(),
]);

console.log('Resolving Wikipedia redirects...');
const articleTitles = [...wikipediaBreeds.keys()];
const redirectMap = await resolveRedirects(articleTitles);
console.log(`  Resolved ${redirectMap.size} redirects.`);

const breeds = mergeBreedData(wikipediaBreeds, wikidataBreeds, redirectMap);

const outputPath = fileURLToPath(new URL('../dog-breeds.json', import.meta.url));
writeFileSync(outputPath, JSON.stringify(breeds, null, 2) + '\n');
console.log(`\nWrote ${breeds.length} breeds to dog-breeds.json`);
