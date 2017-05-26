const chai = require('chai');
const expect = chai.expect;
const searcher = require('../../src/citymunch/searcher');
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
                    return done(new Error('Unexpected location returned: ' + result.location.name));
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
            expectLocation('Old Street', 'London EC2A', done);
        });

        it('should understand major locality names like Old Street ignoring case', (done) => {
            expectLocation('old st', 'London EC2A', done);
        });

        it('should understand major locality names like Islington', (done) => {
            expectLocation('islington', 'London Borough of Islington', done);
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

                    if (result.location.name !== 'London EC2A') {
                        return done(new Error('London EC2A was not returned'));
                    }

                    done();
                })
                .catch(done);
        });

        it('should throw if only a location is understood, without a cuisine or restaurant', (done) => {
            parse('blobblesquid near old street')
                .then(() => done(new Error()))
                .catch(() => done());
        });

        it('should throw UserNeedsToSayWhereTheyAreError if given "around me" and no previous location for this user', (done) => {
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

        it('should throw UserNeedsToSayWhereTheyAreError if given a cuisine and "near me" and no previous location for this user', (done) => {
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
    });
});
