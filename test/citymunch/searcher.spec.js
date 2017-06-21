const chai = require('chai');
const expect = chai.expect;
const searchQueries = require('../../src/citymunch/search-queries');
const searcher = require('../../src/citymunch/searcher');
const savedLocations = require('../../src/citymunch/saved-locations');
const parse = searcher.parse;
const search = searcher.search;
const errors = require('../../src/citymunch/errors');
const mongoose = require('../../src/db');

after(() => {
    mongoose.disconnect(() => {
        mongoose.models = {};
    });
});

describe('Searcher', () => {
    describe('parse() for cuisine types', () => {
        function expectCuisineType(input, expected, done) {
            parse(input).then(result => {
                if (result.cuisineType === expected && result.restaurants.length === 0 && result.location === null) {
                    done();
                } else {
                    done(new Error());
                }
            }).catch(error => {
                console.error(error);
                done(error);
            });
        }

        it('should understand exact cuisine types', (done) => {
            expectCuisineType('Chinese', 'Chinese', done);
        });

        it('should understand cuisine types in a different case', (done) => {
            expectCuisineType('chinese', 'Chinese', done);
        });

        it('should ignore any full-stop at the end of the text', (done) => {
            expectCuisineType('chinese.', 'Chinese', done);
        });

        it('should ignore "food" at the end of the text', (done) => {
            expectCuisineType('chinese food.', 'Chinese', done);
        });

        it('should match the singular version of plural types', (done) => {
            expectCuisineType('burger.', 'Burgers', done);
        });

        it('should trim white space', (done) => {
            expectCuisineType('   MIDDle     eastern    ', 'Middle Eastern', done);
        });
    });

    describe('parse() for restaurant names', () => {
        function expectRestaurants(input, expected, done) {
            parse(input).then(result => {
                if (result.cuisineType !== null) {
                    return done(new Error('Cuisine type returned'));
                }

                if (result.location !== null) {
                    return done(new Error('Location returned'));
                }

                if (result.restaurants.length !== expected.length) {
                    return done(new Error('Wrong number of restaurants returned'));
                }

                const actualNames = result.restaurants.map(r => r.name);

                for (let i = 0; i < expected.length; i++) {
                    if (actualNames.indexOf(expected[i]) === -1) {
                        return done(new Error('Doesn\'t contain ' + expected[i]));
                    }
                }

                done();
            }).catch(error => {
                console.error(error);
                done(error);
            });
        }

        it('should understand exact matches', (done) => {
            expectRestaurants('Boca Empanadas', ['Boca Empanadas'], done);
        });

        it('should understand matches in a different case', (done) => {
            expectRestaurants('boca empanadas', ['Boca Empanadas'], done);
        });

        it('should allow ampersands to be interchangable with the word "and"', (done) => {
            expectRestaurants('Pho and Bun', ['Pho & Bun'], done);
        });

        it('should understand matches ignoring the meta-suffix that chains have', (done) => {
            expectRestaurants(
                'Thali Cafe',
                [
                    'Thali Cafe (Clifton)',
                    'Thali Cafe (Southville)',
                    'Thali Cafe (Totterdown)',
                    'Thali Cafe (Montpelier)',
                    'Thali Cafe (Easton)',
                ],
                done
            );
        });

        it('should trim white space', (done) => {
            expectRestaurants('  Boca  empanadas  ', ['Boca Empanadas'], done);
        });
    });

    describe('parse() for locations', () => {
        function expectLocation(input, expected, done) {
            parse(input).then(result => {
                if (result.cuisineType !== null) {
                    return done(new Error('Cuisine type returned'));
                }

                if (result.restaurants.length > 0) {
                    return done(new Error('Restaurants returned'));
                }

                if (result.location.name !== expected) {
                    return done(new Error('Unexpected location returned: ' + result.location.name + ', had expected: ' + expected));
                }

                done();
            }).catch(error => {
                console.error(error);
                done(error);
            });
        }

        it('should understand full street postcodes', (done) => {
            expectLocation('N1 8JU', 'Danbury St', done);
        });

        it('should understand postcode districts', (done) => {
            expectLocation('EC2A', 'London EC2A', done);
        });

        it('should understand major locality names like Shoreditch', (done) => {
            expectLocation('  shoreditch ', 'Shoreditch', done);
        });

        it('should understand major locality names like Old Street', (done) => {
            expectLocation('Old Street', 'Old St', done);
        });

        it('should understand major locality names like Old Street ignoring case', (done) => {
            expectLocation('old st', 'Old St', done);
        });

        it('should understand major locality names like Islington', (done) => {
            expectLocation('islington', 'London Borough of Islington', done);
        });

        it('should understand street names like Danbury Street', (done) => {
            expectLocation('Danbury Street', 'Danbury St', done);
        });

        it('should disregard conversational cues like "in"', (done) => {
            expectLocation('in soho', 'Soho', done);
        });

        it('should disregard conversational cues like "near"', (done) => {
            expectLocation('near soho', 'Soho', done);
        });

        it('should disregard conversational cues like "around"', (done) => {
            expectLocation('around Bristol', 'Bristol', done);
        });

        it('should disregard conversational cues like "around"', (done) => {
            expectLocation('Around bristol', 'Bristol', done);
        });
    });

    describe('parse() for times', () => {
        function expectTime(input, expectedStartTime, expectedEndTime, done) {
            parse(input).then(result => {
                if (result.cuisineType !== null) {
                    return done(new Error('Cuisine type returned'));
                }

                if (result.restaurants.length > 0) {
                    return done(new Error('Restaurants returned'));
                }

                if (result.location !== null) {
                    return done(new Error('Location returned'));
                }

                if (result.startTime.toString() !== expectedStartTime || result.endTime.toString() !== expectedEndTime) {
                    return done(new Error('Time was not correctly returned'));
                }

                done();
            }).catch(error => {
                done(error);
            });
        }

        it('should understand "lunch"', (done) => {
            expectTime('LUNCH', '12:00', '14:30', done);
        });

        it('should understand "dinner"', (done) => {
            expectTime('dinner.', '17:00', '20:30', done);
        });
    });

    describe('parse() given mixed text', () => {
        it('should support a mixed cuisine type and location', (done) => {
            parse('chinese food in old street please.')
                .then(result => {
                    if (result.restaurants.length > 0) {
                        return done(new Error('Some restaurants were returned'));
                    }

                    if (result.cuisineType !== 'Chinese') {
                        return done(new Error('Chinese cuisine was not returned'));
                    }

                    if (result.location.name !== 'Old St') {
                        return done(new Error('Old St was not returned, got: ' + result.location.name));
                    }

                    done();
                })
                .catch(done);
        });

        it('should support "dinner" and location', (done) => {
            parse('dinner in old street please')
                .then(result => {
                    if (result.restaurants.length > 0) {
                        return done(new Error('Restaurants were wrongly returned'));
                    }

                    if (result.cuisineType) {
                        return done(new Error('Cuisine was wrongly returned'));
                    }

                    if (result.startTime.toString() !== '17:00' || result.endTime.toString() !== '20:30') {
                        return done(new Error('Time was not correctly returned'));
                    }

                    if (result.location.name !== 'Old St') {
                        return done(new Error('Old St was not returned, got: ' + result.location.name));
                    }

                    done();
                })
                .catch(done);
        });

        it('should throw if only a location is understood, without a cuisine or restaurant or time', (done) => {
            parse('blobblesquid near old street')
                .then(() => done(new Error()))
                .catch(() => done());
        });
    });

    describe('parse() given "near me" or "around me"', () => {
        it('should use user\'s location within last 6 hours', (done) => {
            const userId = 'user-with-previous-location-' + Date.now();

            // Insert a previous search result with a location and the same user ID, which should
            // be found and re-used.
            searchQueries.save(
                'Angel, London',
                {location: {name: 'Angel', types: ['ADMINISTRATIVE_AREA_LEVEL_2']}},
                userId
            );

            parse('around me', userId)
                .then(result => {
                    if (result.location.name === 'Angel') {
                        done();
                    } else {
                        done(new Error('Didn\'t get the user\'s most recent location'));
                    }
                })
                .catch(done);
        });

        it('should throw UserNeedsToSayWhereTheyAreError if no previous location for this user', (done) => {
            parse('around me', 'user' + Date.now())
                .then(() => {
                    done(new Error('Got a result when an error should have been thrown'))
                })
                .catch(error => {
                    if (error instanceof errors.UserNeedsToSayWhereTheyAreError) {
                        done();
                    } else {
                        done(new Error('Error is not an instance of UserNeedsToSayWhereTheyAreError'));
                    }
                });
        });

        it('should throw UserNeedsToSayWhereTheyAreError if given a cuisine and no previous location for this user', (done) => {
            parse('chinese near me', 'user' + Date.now())
                .then(() => {
                    done(new Error('Got a result when an error should have been thrown'))
                })
                .catch(error => {
                    if (error instanceof errors.UserNeedsToSayWhereTheyAreError) {
                        done();
                    } else {
                        done(new Error('Error is not an instance of UserNeedsToSayWhereTheyAreError'));
                    }
                });
        });
    });

    describe('parse() given a saved location', () => {
        it('should use the user\'s saved "home" location given query "home"', (done) => {
            const userId = 'user-with-saved-home-' + Date.now();

            // Insert a previous search result with a location and the same user ID, which should
            // be found and re-used.
            savedLocations.save(
                userId,
                'home',
                {name: 'Angel', types: ['ADMINISTRATIVE_AREA_LEVEL_2']}
            );

            parse('home', userId)
                .then(result => {
                    if (result.location.name === 'Angel') {
                        done();
                    } else {
                        done(new Error('Didn\'t get the user\'s saved "home" location'));
                    }
                })
                .catch(done);
        });

        it('should use the user\'s saved "work" location given query "near work"', (done) => {
            const userId = 'user-with-saved-work-' + Date.now();

            // Insert a previous search result with a location and the same user ID, which should
            // be found and re-used.
            savedLocations.save(
                userId,
                'work',
                {name: 'EC2A', types: ['POSTCODE_DISTRICT']}
            );

            parse('near work', userId)
                .then(result => {
                    if (result.location.name === 'EC2A') {
                        done();
                    } else {
                        done(new Error('Didn\'t get the user\'s saved "work" location'));
                    }
                })
                .catch(done);
        });

        it('should use the user\'s saved "work" location given query "chinese near work"', (done) => {
            const userId = 'user-with-saved-work-' + Date.now();

            // Insert a previous search result with a location and the same user ID, which should
            // be found and re-used.
            savedLocations.save(
                userId,
                'work',
                {name: 'EC2A', types: ['POSTCODE_DISTRICT']}
            );

            parse('chinese near work', userId)
                .then(result => {
                    if (result.location.name === 'EC2A' && result.cuisineType === 'Chinese') {
                        done();
                    } else {
                        done(new Error('Didn\'t get the user\'s saved "work" location or parse the cuisine type'));
                    }
                })
                .catch(done);
        });
    });

    describe('parse() given unexpected text', () => {
        it('should throw', (done) => {
            parse('gibberish test text 123')
                .then(() => done(new Error('Resolved but should have thrown')))
                .catch(() => done());
        });

        it('should throw', (done) => {
            parse('gibberish around floffalbum')
                .then(() => done(new Error('Resolved but should have thrown')))
                .catch(() => done());
        });
    });

    describe('search()', () => {
        it('should find offers', (done) => {
            search('italian food in old street please.')
                .then(result => {
                    if (result.message.indexOf('% off at ') !== -1) {
                        done();
                    } else {
                        done(new Error('Result invalid: ' + result));
                    }
                })
                .catch(done);
        });

        it('should return a specifically chosen restaurant even if there are no upcoming offers', (done) => {
            search('K10')
                .then(result => {
                    if (result.hasEvents === false && result.message.indexOf('K10 doesn\'t have any offers coming up today.') !== -1) {
                        done();
                    } else {
                        done(new Error('Result invalid: ' + JSON.stringify(result)));
                    }
                })
                .catch(done);
        });

        it('should indicate to include a "show more" button if there are more than 3 offers', (done) => {
            search('London')
                .then(result => {
                    if (result.addShowMoreButton && result.message && result.messageAfterShowingMore) {
                        done();
                    } else {
                        done(new Error('Result invalid: ' + JSON.stringify(result)));
                    }
                })
                .catch(done);
        });
    });
});
