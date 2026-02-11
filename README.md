# dog-breeds [![CI](https://github.com/chrisvogt/dog-breeds/actions/workflows/ci.yml/badge.svg)](https://github.com/chrisvogt/dog-breeds/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/dog-breeds.svg)](https://www.npmjs.com/package/dog-breeds)

> Get dog breeds

A list of 554 dog breeds, including breed origin and a link to an image of the breed on Wikimedia.

The list is a [JSON file](dog-breeds.json) and can be used anywhere. Data is sourced from [Wikipedia](https://en.wikipedia.org/wiki/List_of_dog_breeds) and [Wikidata](https://www.wikidata.org/).

## Install

```sh
npm install dog-breeds
```

## Usage

```js
import { random, all } from 'dog-breeds';

random();
//=> { name: 'Catahoula Leopard Dog', origin: 'United States', imageURL: 'https://...' }

all;
//=> [{ name: 'Affenpinscher', origin: 'Germany, France', imageURL: '...' }, ...]
```

## API

### random()

Returns a random dog breed object.

#### Return value

Type: `object`

A dog breed object with `name`, `origin`, and `imageURL` properties.

### all

Type: `Array<object>`

All 554 dog breeds in alphabetical order. Each object has the following properties:

- `name` - The breed name
- `origin` - The country or region of origin
- `imageURL` - A link to an image of the breed on Wikimedia

## Updating the data

To refresh the breed list from Wikipedia and Wikidata:

```sh
npm run update-breeds
```

This fetches extant breeds from the [Wikipedia list of dog breeds](https://en.wikipedia.org/wiki/List_of_dog_breeds) and enriches each entry with origin and image data from [Wikidata](https://www.wikidata.org/). No additional dependencies are required.

## Related

- [unique-random-array](https://github.com/sindresorhus/unique-random-array) - Get consecutively unique elements from an array

## License

MIT © [Chris Vogt](https://www.chrisvogt.me)
