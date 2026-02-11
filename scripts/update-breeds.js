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
import process from 'node:process';
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
 * Parse breed names and article titles from Wikipedia wikitext.
 * Only includes breeds from the "Extant" section.
 *
 * @param {string} wikitext - Raw wikitext of the "List of dog breeds" page
 * @returns {Map<string, string>} article title → display name
 */
export function parseBreedListWikitext(wikitext) {
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

  return breeds;
}

/**
 * Parse Wikidata SPARQL results into a breed data map.
 *
 * @param {object[]} bindings - The `results.bindings` array from a SPARQL response
 * @returns {Map<string, object>} Wikipedia article title → { name, origin, imageURL }
 */
export function parseWikidataResults(bindings) {
  const breeds = new Map();

  for (const result of bindings) {
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

  return breeds;
}

/**
 * Look up a breed in the Wikidata map, trying the original title first,
 * then the resolved redirect target.
 *
 * @param {string} articleTitle - The Wikipedia article title to look up
 * @param {Map<string, object>} wikidataBreeds - Wikidata breed data
 * @param {Map<string, string>} redirectMap - Wikipedia redirect mappings
 * @returns {object|undefined} The breed data, or undefined if not found
 */
export function findInWikidata(articleTitle, wikidataBreeds, redirectMap) {
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
 *
 * @param {Map<string, string>} wikipediaBreeds - article title → display name
 * @param {Map<string, object>} wikidataBreeds - article title → breed data
 * @param {Map<string, string>} redirectMap - Wikipedia redirect mappings
 * @returns {object[]} Merged breed array, sorted alphabetically by name
 */
export function mergeBreedData(wikipediaBreeds, wikidataBreeds, redirectMap) {
  const merged = [];
  const unmatched = [];

  for (const [articleTitle, displayName] of wikipediaBreeds) {
    const wikidataEntry = findInWikidata(articleTitle, wikidataBreeds, redirectMap);

    if (wikidataEntry) {
      merged.push({
        name: displayName,
        origin: wikidataEntry.origin,
        imageURL: wikidataEntry.imageURL,
      });
    } else {
      unmatched.push(displayName);
      merged.push({
        name: displayName,
        origin: '',
        imageURL: '',
      });
    }
  }

  merged.sort((a, b) => a.name.localeCompare(b.name));
  return merged;
}

// --- Network functions (not exported; tested indirectly via integration) ---

async function fetchWikipediaBreedList() {
  console.log('Fetching Wikipedia "List of dog breeds" page...');

  const url = new URL(WIKIPEDIA_API);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', 'List_of_dog_breeds');
  url.searchParams.set('prop', 'wikitext');
  url.searchParams.set('format', 'json');

  const response = await fetch(url, {headers: {'User-Agent': USER_AGENT}});
  const data = await response.json();
  const breeds = parseBreedListWikitext(data.parse.wikitext['*']);

  console.log(`  Found ${breeds.size} extant breeds on Wikipedia.`);
  return breeds;
}

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

async function fetchWikidataBreedInfo() {
  console.log('Querying Wikidata for breed origins and images...');

  const url = new URL(WIKIDATA_SPARQL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('query', SPARQL_QUERY);

  const response = await fetch(url, {headers: {'User-Agent': USER_AGENT}});
  const data = await response.json();
  const breeds = parseWikidataResults(data.results.bindings);

  console.log(`  Found ${breeds.size} breeds with Wikipedia articles in Wikidata.`);
  return breeds;
}

async function main() {
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
  console.log(`Wrote ${breeds.length} breeds to dog-breeds.json`);
}

// Only run when executed directly (not when imported by tests)
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  await main();
}
