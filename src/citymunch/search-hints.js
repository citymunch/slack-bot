'use strict';

const cmApi = require('./api');

let apiResponse;

let hasLoaded = false;

const getResponsePromise = new Promise(function(resolve, reject) {
    const interval = setInterval(function() {
        if (hasLoaded) {
            resolve({
                cuisineTypes: apiResponse.cuisineTypes.map(type => type.name),
                restaurants: apiResponse.restaurants,
            });
            clearInterval(interval);
        }
    }, 30);
});

function update() {
    cmApi.get('/offers/search-hints')
        .then(searchHints => {
            apiResponse = searchHints;
            hasLoaded = true;
        })
        .catch(error => {
            console.error('Error getting search hints', error);
        });
}

update();

// Update cuisine types every 20 minutes.
setInterval(update, 1000 * 60 * 20);

/**
 * @return {Promise}
 */
async function getCuisineTypes() {
    const response = await getResponsePromise;
    return response.cuisineTypes;
}

/**
 * @return {Promise}
 */
async function getRestaurants() {
    const response = await getResponsePromise;
    return response.restaurants;
}

/**
 * Resolves to a string if the given text approximately matches.
 * Resolves to false if there is no match.
 *
 * @return {Promise}
 */
async function matchCuisineType(text) {
    let lowerCaseText = text.toLowerCase().trim().replace(/\s{2,}/, ' ');

    if (lowerCaseText.endsWith(' food')) {
        lowerCaseText = lowerCaseText.substring(0, lowerCaseText.length - 5);
    }

    const cuisineTypes = await getCuisineTypes();

    for (let i = 0; i < cuisineTypes.length; i++) {
        if (cuisineTypes[i].toLowerCase() === lowerCaseText) {
            return cuisineTypes[i];
        }
    }

    return false;
}

const HAS_SUFFIX_REGEX = /.+[\(@]/;

/**
 * Resolves to an array of restaurant objects where the given text approximately matches the name.
 *
 * @return {Promise}
 */
async function matchRestaurants(text) {
    const lowerCaseText = text.toLowerCase().trim().replace(/\s{2,}/g, ' ');
    const restaurants = await getRestaurants();
    const matches = [];

    for (let i = 0; i < restaurants.length; i++) {
        const name = restaurants[i].name.toLowerCase();

        if (name === lowerCaseText) {
            matches.push(restaurants[i]);
            continue;
        }

        if (name.indexOf('&') !== -1 && name.replace(/&/g, 'and').trim() === lowerCaseText) {
            matches.push(restaurants[i]);
            continue;
        }

        if (HAS_SUFFIX_REGEX.test(name)) {
            const withoutSuffix = name.split(/[\(@]/)[0].trim();
            if (withoutSuffix === lowerCaseText) {
                matches.push(restaurants[i]);
                continue;
            }
        }
    }

    return matches;
}

module.exports = {
    matchCuisineType,
    matchRestaurants,
};
