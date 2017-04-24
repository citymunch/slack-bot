'use strict';

const cmApi = require('./api');
const geocoder = require('./geocoder');
const localDateTime = require('local-date-time');
const searchHints = require('./search-hints');

const MIXED_REGEX = new RegExp(/.+ (in|around|near) .+/, 'i');
const MIXED_SPLIT_REGEX = new RegExp(/ (in|around|near) /, 'i');

/**
 * Resolves to an object if successful. Rejects if unsuccessful.
 *
 * @return {Promise}
 */
async function parse(text) {
    text = text.trim();

    if (text.endsWith('.')) {
        text = text.substring(0, text.length - 1).trim();
    }

    if (text.toLowerCase().endsWith('please')) {
        text = text.substring(0, text.length - 6).trim();
    }

    if (MIXED_REGEX.test(text)) {
        return await parseMixed(text);
    } else {
        return await parseSingle(text);
    }
}

async function parseSingle(text) {
    const result = {
        cuisineType: null,
        restaurants: [],
        location: null,
    };

    const cuisineType = await searchHints.matchCuisineType(text);
    if (cuisineType !== false) {
        result.cuisineType = cuisineType;
        return result;
    }

    const restaurants = await searchHints.matchRestaurants(text);
    if (restaurants.length > 0) {
        result.restaurants = restaurants;
        return result;
    }

    try {
        const location = await geocoder.geocode(text);
        result.location = location;
        return result;
    } catch (e) {
        // Geocode failed -- ignore.
    }

    throw new Error('Could not parse text: ' + text);
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
        throw new Error('Could not parse text: ' + text);
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
async function search(text) {
    const criteria = await parse(text);

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
                + '&rangeInKilometers=3';
        } else {
            throw new Error('Unsure what to do with location: ' + JSON.stringify(criteria.location));
        }
    }

    const authorisedRestaurantsResponse = await cmApi.get(url);
    if (authorisedRestaurantsResponse.results.length === 0) {
        throw new Error('We couldn\'t find anything matching that search right now');
    }

    const restaurantIds = authorisedRestaurantsResponse.results.map(result => result.restaurant.id);
    const today = localDateTime.LocalDate.today();
    const activeEventsRespones = await cmApi.get(
        '/offers/search/active-events-by-restaurant-ids?ids=' + restaurantIds.join(',') +
        '&includeEnded=false' +
        `&startDate=${today.toString()}` +
        `&endDate=${today.toString()}`
    );

    const events = activeEventsRespones.events;
    if (events.length === 0) {
        if (criteria.restaurants.length > 0) {
            // If the user wanted a specific restaurant, always return a link to them, even if there
            // are no offer events today.
            const chosenRestaurant = criteria.restaurants[0];
            return {
                parsedCriteria: criteria,
                hasEvent: false,
                message: `${chosenRestaurant.name} doesn\'t have any offers coming up today.`,
                restaurant: {
                    id: chosenRestaurant.id,
                },
            };
        } else {
            throw new Error('We couldn\'t find any offers for that search that are on today');
        }
    }

    const event = events[Math.floor(Math.random() * events.length)];

    const prettyDate = formatLocalDate(localDateTime.LocalDate.of(event.event.date));
    const prettyStartTime = formatLocalTime(localDateTime.LocalTime.of(event.event.startTime));
    const prettyEndTime = formatLocalTime(localDateTime.LocalTime.of(event.event.endTime));

    return {
        parsedCriteria: criteria,
        hasEvent: true,
        message: `${event.offer.discount}% off at ${event.restaurant.name} (${event.restaurant.streetName}) - ${prettyStartTime}-${prettyEndTime} on ${prettyDate}`,
        restaurant: {
            id: event.restaurant.id,
        },
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
