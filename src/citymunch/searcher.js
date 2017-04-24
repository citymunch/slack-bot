'use strict';

const cmApi = require('./api');
const config = require('../../config/server');
const geocoder = require('./geocoder');
const localDateTime = require('local-date-time');
const searchHints = require('./search-hints');
const searchQueries = require('./search-queries');

const MIXED_REGEX = new RegExp(/.+ (in|around|near) .+/, 'i');
const MIXED_SPLIT_REGEX = new RegExp(/ (in|around|near) /, 'i');

/**
 * Resolves to an object if successful. Rejects if unsuccessful.
 *
 * @return {Promise}
 */
async function parse(text, userId) {
    text = text.trim();

    if (text.endsWith('.')) {
        text = text.substring(0, text.length - 1).trim();
    }

    if (text.toLowerCase().endsWith('please')) {
        text = text.substring(0, text.length - 6).trim();
    }

    let result;
    if (MIXED_REGEX.test(text)) {
        result = await parseMixed(text);
    } else {
        result = await parseSingle(text, userId);
    }
    searchQueries.save(text, result, userId);
    return result;
}

async function parseSingle(text, userId) {
    const result = {
        cuisineType: null,
        restaurants: [],
        location: null,
    };

    const restaurants = await searchHints.matchRestaurants(text);
    if (restaurants.length > 0) {
        result.restaurants = restaurants;
        return result;
    }

    const cuisineType = await searchHints.matchCuisineType(text);
    if (cuisineType !== false) {
        result.cuisineType = cuisineType;
    }

    try {
        const location = await geocoder.geocode(text);
        result.location = location;
        return result;
    } catch (e) {
        // Geocode failed -- ignore.
    }

    // If only a cuisine type was searched for, without a location, and the user has searched for a
    // location previously, assume that location.
    if (result.cuisineType && !result.location) {
        if (userId) {
            const latestLocationForSameUser = await searchQueries.findLatestLocationByUserId(userId);
            if (latestLocationForSameUser) {
                console.log('Adopted location from last search by same user', latestLocationForSameUser);
                result.location = latestLocationForSameUser;
            }
        }
        return result;
    } else if (result.cuisineType && result.location) {
        return result;
    } else {
        throw new Error('Could not parse text: ' + text);
    }
}

async function parseMixed(text) {
    const result = {
        cuisineType: null,
        restaurants: [],
        location: null,
    };

    const parts = text.split(MIXED_SPLIT_REGEX);
    const cuisineOrRestaurantText = parts[0];
    const locationText = parts[2];

    const cuisineType = await searchHints.matchCuisineType(cuisineOrRestaurantText);
    if (cuisineType !== false) {
        result.cuisineType = cuisineType;
    }

    const restaurants = await searchHints.matchRestaurants(cuisineOrRestaurantText);
    if (restaurants.length > 0) {
        result.restaurants = restaurants;
    }

    if (!result.cuisineType && result.restaurants.length === 0) {
        // Prevent something like "prawns in London" searching only for London with no cuisine,
        // because the user wanted prawns (not a CityMunch cuisine) but might get Italian if only
        // location is used.
        throw new Error('Could not parse text: ' + text);
    }

    try {
        const location = await geocoder.geocode(locationText);
        result.location = location;
    } catch (e) {
        // Geocode failed -- fail because the mixed query must be location-limited.
        throw new Error('Could not geocode: ' + text);
    }

    return result;
}

function commaSeperatePoint(point) {
    return `${point.latitude},${point.longitude}`;
}

const EARTH_RADIUS_IN_METERS = 6371000;

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * @param  {Object} cord1 Must have properties 'latitude' and 'longitude'.
 * @param  {Object} cord2 Must have properties 'latitude' and 'longitude'.
 * @return {Number}
 */
function calculateDistanceBetweenTwoCoordsInMeters(cord1, cord2) {
    const lat1 = cord1.latitude;
    const lon1 = cord1.longitude;
    const lat2 = cord2.latitude;
    const lon2 = cord2.longitude;

    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);

    const squareOfHalfCoordBetweenPositions = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const angularDistanceInRadians = 2 * Math.atan2(
        Math.sqrt(squareOfHalfCoordBetweenPositions),
        Math.sqrt(1 - squareOfHalfCoordBetweenPositions)
    );

    return angularDistanceInRadians * EARTH_RADIUS_IN_METERS;
}

/**
 * Resolves if there are upcoming events today.
 * Rejects if there is no upcoming event today.
 *
 * @return {Promise}
 */
async function search(text, userId) {
    const criteria = await parse(text, userId);

    let url = '/restaurants/search/authorised-restaurants?';

    if (criteria.cuisineType) {
        url += `&cuisineTypes=${criteria.cuisineType}`;
    }

    if (criteria.restaurants.length > 0) {
        const ids = criteria.restaurants.map(r => r.id).join(',');
        url += `&ids=${ids}`;
    }

    if (criteria.location) {
        const isInAreaSearch = criteria.location.northeast && criteria.location.southwest &&
            calculateDistanceBetweenTwoCoordsInMeters(criteria.location.northeast, criteria.location.southwest) > 300;

        if (isInAreaSearch) {
            url += `&northeastPoint=${commaSeperatePoint(criteria.location.northeast)}`
                + `&southwestPoint=${commaSeperatePoint(criteria.location.southwest)}`;
        } else if (criteria.location.center) {
            url += `&nearPoint=${commaSeperatePoint(criteria.location.center)}`
                + '&rangeInKilometers=1';
        } else {
            throw new Error('Unsure what to do with location: ' + JSON.stringify(criteria.location));
        }

        if (criteria.location.isFullPostcode && criteria.location.center) {
            url += `&userPoint=${commaSeperatePoint(criteria.location.center)}`;
        }
    }

    const authorisedRestaurantsResponse = await cmApi.get(url);
    if (authorisedRestaurantsResponse.results.length === 0) {
        throw new Error('We couldn\'t find anything matching that search right now');
    }

    function getWalkingDistance(restaurantId) {
        const matches = authorisedRestaurantsResponse.results.filter(result => {
            return result.restaurant.id === restaurantId;
        });
        if (matches.length === 0) {
            return null;
        }
        if (!matches[0].walkingDistance) {
            return null;
        }
        return matches[0].walkingDistance.durationText;
    }

    const restaurantIds = authorisedRestaurantsResponse.results.map(result => result.restaurant.id);
    const today = localDateTime.LocalDate.today();
    const activeEventsRespones = await cmApi.get(
        '/offers/search/active-events-by-restaurant-ids?ids=' + restaurantIds.join(',') +
        '&includeEnded=false' +
        `&startDate=${today.toString()}` +
        `&endDate=${today.toString()}`
    );

    const events = activeEventsRespones.events
        .filter(event => event.event.isActiveOnDate)
        .filter(event => !event.event.hasEnded);

    if (events.length === 0) {
        if (criteria.restaurants.length > 0) {
            // If the user wanted a specific restaurant, always return a link to them, even if there
            // are no offer events today.
            let message = '';
            for (let i = 0; i < criteria.restaurants.length; i++) {
                const restaurant = criteria.restaurants[i];
                message += `${restaurant.name} doesn\'t have any offers coming up today.\n`;
                message += `<${config.urlShortener}/restaurant/${restaurant.id}?utm_source=CM&utm_medium=SB&utm_content=TXT&utm_campaign=CB|View on CityMunch>\n`;
            }

            return {
                parsedCriteria: criteria,
                hasEvents: false,
                message,
            };
        } else {
            throw new Error('We couldn\'t find any offers for that search that are on today');
        }
    }

    let message = '';
    for (let i = 0; i < events.length; i++) {
        if (i >= 3) {
            break;
        }

        const event = events[i];
        const prettyDate = formatLocalDate(localDateTime.LocalDate.of(event.event.date));
        const prettyStartTime = formatLocalTime(localDateTime.LocalTime.of(event.event.startTime));
        const prettyEndTime = formatLocalTime(localDateTime.LocalTime.of(event.event.endTime));
        const walkingDistance = getWalkingDistance(event.restaurant.id);

        message += `${event.offer.discount}% off at ${event.restaurant.name} (${event.restaurant.streetName}) - ${prettyStartTime}-${prettyEndTime} on ${prettyDate}`;
        if (walkingDistance) {
            message += ` (${walkingDistance} away)`;
        }
        message += '\n';
        message += `<${config.urlShortener}/restaurant/${event.restaurant.id}?utm_source=CM&utm_medium=SB&utm_content=TXT&utm_campaign=CB|Reserve voucher>\n`;
    }
    message = message.trim();

    return {
        parsedCriteria: criteria,
        hasEvents: true,
        message,
    };
}

const MONTHS = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

function formatLocalDate(localDate) {
    const date = localDate.getNativeDateLazily();
    return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
}

function formatLocalTime(localTime) {
    const hours = Number(localTime.toString().substr(0, 2));
    // Don't cast minutes to a number because we want to keep any preceding zero.
    const minutes = localTime.toString().substr(3, 2);

    let string;

    if (hours === 0 || hours === 24) {
        string = '12:' + minutes + 'am';
    } else if (hours === 12) {
        string = '12:' + minutes + 'pm';
    } else if (hours > 12) {
        string = (hours - 12) + ':' + minutes + 'pm';
    } else {
        // Cast to number to remove preceding zero.
        string = Number(hours) + ':' + minutes + 'am';
    }

    return string.replace(':00', '');
}

module.exports = {
    parse,
    search,
};
