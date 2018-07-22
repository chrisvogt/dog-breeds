'use strict';

const uniqueRandomArray = require('unique-random-array');
const dogBreeds = require('./dog-breeds.json');

module.exports.all = dogBreeds;
module.exports.random = uniqueRandomArray(dogBreeds);
