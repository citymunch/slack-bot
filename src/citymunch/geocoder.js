'use strict';

const cmApi = require('./api');
const queryString = require('querystring');

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
            return response.geometry;
        });
}

module.exports = {
    geocode,
};
