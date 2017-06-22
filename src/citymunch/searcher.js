'use strict';

const cmApi = require('./api');
const config = require('../../config/server');
const geocoder = require('./geocoder');
const LocalDate = require('local-date-time').LocalDate;
const LocalTime = require('local-date-time').LocalTime;
const searchHints = require('./search-hints');
const searchQueries = require('./search-queries');
const utils = require('../utils');
const errors = require('./errors');
const guid = require('guid');
const savedLocations = require('./saved-locations');

const MIXED_REGEX = new RegExp(/.+ (in|around|near) .+/, 'i');
const MIXED_SPLIT_REGEX = new RegExp(/ (in|around|near) /, 'i');

const LOCATION_NEAR_ME_TEXTS = ['near me', 'around me', 'here'];

const TEN_PM = LocalTime.of('22:00');

function createEmptyParseResult() {
    return {
        // A string of the cuisine type name.
        cuisineType: null,
        // An array of restaurant IDs.
        restaurants: [],
        // An object as returned from the geocoding API.
        location: null,
        // A `LocalTime` object.
        startTime: null,
        // A `LocalTime` object.
        endTime: null,
    };
}

/**
 * Resolves to an object if successful. Rejects if unsuccessful.
 *
 * The object resolved has a combination of the properties returned by `createEmptyParseResult`.
 *
 * @return {Promise}
 * @throws {UserNeedsToSayWhereTheyAreError}
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
        result = await parseMixed(text, userId);
    } else {
        result = await parseSingle(text, userId);
    }
    searchQueries.save(text, result, userId);
    return result;
}

/**
 * @throws {UserNeedsToSayWhereTheyAreError}
 */
async function parseSingle(text, userId) {
    const result = createEmptyParseResult();

    const restaurants = await searchHints.matchRestaurants(text);
    if (restaurants.length > 0) {
        result.restaurants = restaurants;
        return result;
    }

    const cuisineType = await searchHints.matchCuisineType(text);
    if (cuisineType !== false) {
        result.cuisineType = cuisineType;
    }

    const normalizedText = utils.normalizeSearchInput(text);

    if (normalizedText === 'dinner') {
        result.startTime = LocalTime.of('17:00');
        result.endTime = LocalTime.of('20:30');
    }

    if (normalizedText === 'lunch') {
        result.startTime = LocalTime.of('12:00');
        result.endTime = LocalTime.of('14:30');
    }

    if (userId) {
        // Match 'home' and 'work'.
        if (savedLocations.isOption(normalizedText)) {
            const savedLocation = await savedLocations.getSavedLocation(normalizedText, userId);
            if (savedLocation) {
                result.location = savedLocation.locationObject;
                result.isLocationFromHistory = true;
                return result;
            }
        }
        // Match 'near home' and 'near work'.
        if (normalizedText.indexOf('near ') === 0 && savedLocations.isOption(normalizedText.substring(5))) {
            const savedLocation = await savedLocations.getSavedLocation(normalizedText.substring(5), userId);
            if (savedLocation) {
                result.location = savedLocation.locationObject;
                result.isLocationFromHistory = true;
                return result;
            }
        }
    }

    if (LOCATION_NEAR_ME_TEXTS.indexOf(normalizedText) !== -1) {
        const latestLocationForSameUser = await searchQueries.findLatestLocationByUserId(userId, utils.getDateNHoursAgo(6));
        if (latestLocationForSameUser) {
            console.log('Adopted location from last search by same user', latestLocationForSameUser);
            result.location = latestLocationForSameUser;
            result.isLocationFromHistory = true;
            return result;
        } else {
            console.log('Asking the user where they are');
            throw new errors.UserNeedsToSayWhereTheyAreError();
        }
    }

    if (!result.location) {
        try {
            const location = await geocoder.geocode(text);
            result.location = location;
            return result;
        } catch (e) {
            // Geocode failed -- ignore.
        }
    }

    if (result.cuisineType || result.startTime || result.endTime) {
        // If the user has searched for a location previously, assume that location.
        if (!result.location && userId) {
            const latestLocationForSameUser = await searchQueries.findLatestLocationByUserId(userId);
            if (latestLocationForSameUser) {
                console.log('Adopted location from last search by same user', latestLocationForSameUser);
                result.location = latestLocationForSameUser;
                result.isLocationFromHistory = true;
                return result;
            }
        }

        return result;
    }

    throw new Error('Could not parse text: ' + text);
}

/**
 * @throws {UserNeedsToSayWhereTheyAreError}
 */
async function parseMixed(text, userId) {
    const result = createEmptyParseResult();

    const parts = text.split(MIXED_SPLIT_REGEX);
    const cuisineOrRestaurantOrTimeText = parts[0];
    const locationText = parts[2];

    const cuisineType = await searchHints.matchCuisineType(cuisineOrRestaurantOrTimeText);
    if (cuisineType !== false) {
        result.cuisineType = cuisineType;
    }

    const restaurants = await searchHints.matchRestaurants(cuisineOrRestaurantOrTimeText);
    if (restaurants.length > 0) {
        result.restaurants = restaurants;
    }

    const normalizedCuisineOrRestaurantOrTimeText = utils.normalizeSearchInput(cuisineOrRestaurantOrTimeText);

    if (normalizedCuisineOrRestaurantOrTimeText === 'dinner') {
        result.startTime = LocalTime.of('17:00');
        result.endTime = LocalTime.of('20:30');
    }

    if (normalizedCuisineOrRestaurantOrTimeText === 'lunch') {
        result.startTime = LocalTime.of('12:00');
        result.endTime = LocalTime.of('14:30');
    }

    if (!result.cuisineType && result.restaurants.length === 0 && !result.startTime && !result.endTime) {
        // Prevent something like "prawns in London" searching only for London with no cuisine,
        // because the user wanted prawns (not a CityMunch cuisine) but might get Italian if only
        // location is used.
        throw new Error('Could not parse text: ' + text);
    }

    const normalizedLocationText = utils.normalizeSearchInput(locationText);

    if (userId) {
        // Match 'near home' and 'around work'.
        const savedLocation = await savedLocations.getSavedLocation(normalizedLocationText, userId);
        if (savedLocation) {
            console.log('Adopted location from user\'s saved location', normalizedLocationText, savedLocation.locationObject);
            result.location = savedLocation.locationObject;
            result.isLocationFromHistory = true;
            return result;
        }
    }

    // Match 'near me' and 'around me'.
    if (normalizedLocationText === 'me') {
        const latestLocationForSameUser = await searchQueries.findLatestLocationByUserId(userId, utils.getDateNHoursAgo(6));
        if (latestLocationForSameUser) {
            console.log('Adopted location from last search by same user', latestLocationForSameUser);
            result.location = latestLocationForSameUser;
            result.isLocationFromHistory = true;
            return result;
        } else {
            console.log('Asking the user where they are');
            throw new errors.UserNeedsToSayWhereTheyAreError();
        }
    }

    try {
        const location = await geocoder.geocode(locationText);
        result.location = location;
        return result;
    } catch (e) {
        // Geocode failed -- fail because the mixed query must be location-limited.
        throw new Error('Could not geocode: ' + text);
    }
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

const MIN_SEARCH_AREA_IN_KILOMETERS = 1.2;

/**
 * Resolves if there are upcoming events today.
 * Rejects if there is no upcoming event today.
 *
 * @return {Promise}
 * @throws {UserNeedsToSayWhereTheyAreError}
 */
async function search(text, userId) {
    const criteria = await parse(text, userId);
    return searchByCriteria(criteria);
}

/**
 * Resolves if there are upcoming events today.
 * Rejects if there is no upcoming event today.
 *
 * @return {Promise}
 * @throws {UserNeedsToSayWhereTheyAreError}
 */
async function searchByCriteria(criteria) {
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
            calculateDistanceBetweenTwoCoordsInMeters(criteria.location.northeast, criteria.location.southwest) >= (MIN_SEARCH_AREA_IN_KILOMETERS * 1000);

        if (isInAreaSearch) {
            url += `&northeastPoint=${commaSeperatePoint(criteria.location.northeast)}`
                + `&southwestPoint=${commaSeperatePoint(criteria.location.southwest)}`;
        } else if (criteria.location.center) {
            url += `&nearPoint=${commaSeperatePoint(criteria.location.center)}`
                + '&rangeInKilometers=' + MIN_SEARCH_AREA_IN_KILOMETERS;
        } else {
            throw new Error('Unsure what to do with location: ' + JSON.stringify(criteria.location));
        }

        if ((criteria.location.isFullPostcode || criteria.location.isStreet) && criteria.location.center) {
            url += `&userPoint=${commaSeperatePoint(criteria.location.center)}`;
        }
    }

    const authorisedRestaurantsResponse = await cmApi.get(url);
    if (authorisedRestaurantsResponse.results.length === 0) {
        throw new Error('We couldn\'t find anything matching that search right now');
    }

    /**
     * @return {Object|null}
     */
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
        return matches[0].walkingDistance;
    }

    const restaurantIds = authorisedRestaurantsResponse.results.map(result => result.restaurant.id);
    const today = LocalDate.today();

    let activeEventsUrl = '/offers/search/active-events-by-restaurant-ids?ids=' + restaurantIds.join(',') +
        '&includeEnded=false' +
        '&startDate=' + today.toString() +
        '&endDate=' + today.toString();

    if (criteria.startTime) {
        activeEventsUrl += '&startTime=' + criteria.startTime.toString();
    }
    if (criteria.endTime) {
        activeEventsUrl += '&endTime=' + criteria.endTime.toString();
    }

    const activeEventsResponse = await cmApi.get(activeEventsUrl);

    const events = activeEventsResponse.events
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
                message += `<${config.urlShortener}/slack/${restaurant.id}|View on CityMunch>\n`;
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

    // Walking distance should be available if the search was by a street name or full postcode, and
    // not if the search was by a locality.
    let hasWalkingDistances = false;
    events.forEach(event => {
        event.walkingDistance = getWalkingDistance(event.restaurant.id);
        if (event.walkingDistance) {
            hasWalkingDistances = true;
        }
    });

    const now = LocalTime.now();
    const nextTwoHours = [];
    const onLater = [];

    events.forEach(event => {
        if (event.event.hasStarted) {
            nextTwoHours.push(event);
            return;
        }
        const startTime = LocalTime.of(event.event.startTime);
        if (event.event.isToday && startTime.compareTo(TEN_PM) >= 0 && now.compareTo(TEN_PM) >= 0) {
            nextTwoHours.push(event);
            return;
        }
        if (event.event.isToday && startTime.isBefore(TEN_PM) && now.addHours(2).compareTo(startTime) >= 0) {
            nextTwoHours.push(event);
            return;
        }

        onLater.push(event);
    });

    if (hasWalkingDistances) {
        nextTwoHours.sort((e1, e2) => e1.walkingDistance.distanceInMeters - e2.walkingDistance.distanceInMeters);
        onLater.sort((e1, e2) => e1.walkingDistance.distanceInMeters - e2.walkingDistance.distanceInMeters);
    }

    let offerMessageParts = [];

    let hasShowedNextTwoHoursHeader = false;
    let hasShowedOnLaterHeader = false;

    let nextTwoHoursOrLaterHeaderSuffix;
    if (criteria.location) {
        if (criteria.location.types[0] === 'ROUTE' || criteria.location.types[0] === 'POSTAL_CODE') {
            nextTwoHoursOrLaterHeaderSuffix = 'near ' + criteria.location.name;
        } else {
            nextTwoHoursOrLaterHeaderSuffix = 'in ' + criteria.location.name;
        }
    }

    function buildMessageFromEvent(event, inNextTwoHours) {
        const prettyStartTime = utils.formatLocalTime(LocalTime.of(event.event.startTime));
        const prettyEndTime = utils.formatLocalTime(LocalTime.of(event.event.endTime));
        const walkingDistance = getWalkingDistance(event.restaurant.id);

        let eventMessage = '';

        if (inNextTwoHours && !hasShowedNextTwoHoursHeader) {
            eventMessage += '*Next two hours';
            if (nextTwoHoursOrLaterHeaderSuffix) {
                eventMessage += ' ' + nextTwoHoursOrLaterHeaderSuffix;
            }
            eventMessage += '*:\n';
            hasShowedNextTwoHoursHeader = true;
        }
        if (!inNextTwoHours && !hasShowedOnLaterHeader) {
            eventMessage += '*On later';
            if (nextTwoHoursOrLaterHeaderSuffix) {
                eventMessage += ' ' + nextTwoHoursOrLaterHeaderSuffix;
            }
            eventMessage += '*:\n';
            hasShowedOnLaterHeader = true;
        }

        eventMessage += `${event.event.discount}% off`;

        if (event.offer.itemName) {
            eventMessage += ` *${event.offer.itemName}*`;
        }

        eventMessage += ` at ${event.restaurant.name} (${event.restaurant.streetName}) - ${prettyStartTime}-${prettyEndTime}`;

        if (!event.event.isToday) {
            const prettyDate = utils.formatLocalDate(LocalDate.of(event.event.date));
            eventMessage += ` on ${prettyDate}`;
        }

        if (walkingDistance) {
            eventMessage += ` (${walkingDistance.durationText} away)`;
        }

        if (event.event.coversRemaining === 0) {
            eventMessage += ' (all gone!)';
        } else if (event.event.coversRemaining <= 5) {
            eventMessage += ` (${event.event.coversRemaining} left)`;
        }

        if (event.offer.groupDiscountBonuses && event.offer.groupDiscountBonuses.length > 0) {
            const groupBonus = event.offer.groupDiscountBonuses[0];
            const totalDiscount = groupBonus.bonus + event.event.discount;
            eventMessage += `\nGroups of ${groupBonus.minCovers}+ get ${totalDiscount}%`;
        }

        eventMessage += '\n';
        eventMessage += `<${config.urlShortener}/slack/${event.restaurant.id}|Reserve voucher>\n`;

        eventMessage = eventMessage.trim();

        offerMessageParts.push(eventMessage);
    }

    nextTwoHours.forEach(event => buildMessageFromEvent(event, true));
    onLater.forEach(event => buildMessageFromEvent(event, false));

    let message = '';
    let messageAfterShowingMore = '';

    offerMessageParts = offerMessageParts.slice(0, 10);

    if (offerMessageParts.length > 3) {
        message += offerMessageParts.slice(0, 3).join('\n');
        messageAfterShowingMore += offerMessageParts.slice(3).join('\n');
    } else {
        message += offerMessageParts.join('\n');
    }

    return {
        parsedCriteria: criteria,
        hasEvents: true,
        message,
        messageAfterShowingMore,
        addShowMoreButton: !!messageAfterShowingMore,
        searchId: guid.raw(),
    };
}

module.exports = {
    // `parse` is only exported for testing.
    parse,
    search,
    searchByCriteria,
    createEmptyParseResult,
};
