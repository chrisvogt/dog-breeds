# dog-breeds [![Build Status](https://travis-ci.org/chrisvogt/dog-breeds.svg?branch=master)](https://travis-ci.org/chrisvogt/dog-breeds)

> Get dog breeds

A list of 514 dog breeds, including breed origin and a link to an image of the breed on Wikimedia.

The list is a [JSON file](dog-breeds.json) and can be used anywhere.


## Install

```
$ npm install dog-breeds
```


## Usage

```js
const dogBreeds = require('dog-breeds');

dogBreeds.random();
/*
{
  "name": "Catahoula Leopard Dog",
  "origin": "United States",
  "imageURL": "https://upload.wikimedia.org/wikipedia/commons/7/76/Louisiana_Cataholula_Leopard_Dog_-_Coahoma_Arkansas.JPG"
}
*/
```


## API

### .all

Type: `Array`

Dog breeds in alphabetical order.

### .random()

Type: `Function`

Random dog breed.


## License

MIT © [Chris Vogt](https://www.chrisvogt.me)
