'use strict';

const cmApi = require('./api');
const queryString = require('querystring');

const FULL_POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;

/**
 * @return {Promise} Resolves if found. Rejects otherwise.
 */
async function geocode(text) {
    if (text.startsWith('in ') || text.startsWith('In ')) {
        text = text.substring(3);
    } else if (text.startsWith('near ') || text.startsWith('Near ')) {
        text = text.substring(5);
    } else if (text.startsWith('around ') || text.startsWith('Around ')) {
        text = text.substring(7);
    }

    return cmApi.get('/geo/geocode?placeName=' + queryString.escape(text))
        .then(response => {
            if (!response.isFound) {
                throw new Error('Could not geocode location: ' + text);
            }

            const result = response.geometry;
            result.isFullPostcode = FULL_POSTCODE_REGEX.test(text);
            return result;
        });
}

module.exports = {
    geocode,
};
