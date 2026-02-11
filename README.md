# dog-breeds [![CI](https://github.com/chrisvogt/dog-breeds/actions/workflows/ci.yml/badge.svg)](https://github.com/chrisvogt/dog-breeds/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/dog-breeds.svg)](https://www.npmjs.com/package/dog-breeds)

> Get dog breeds

A list of 514 dog breeds, including breed origin and a link to an image of the breed on Wikimedia.

The list is a [JSON file](dog-breeds.json) and can be used anywhere.

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

All 514 dog breeds in alphabetical order. Each object has the following properties:

- `name` - The breed name
- `origin` - The country or region of origin
- `imageURL` - A link to an image of the breed on Wikimedia

## Related

- [unique-random-array](https://github.com/sindresorhus/unique-random-array) - Get consecutively unique elements from an array

## License

MIT © [Chris Vogt](https://www.chrisvogt.me)
