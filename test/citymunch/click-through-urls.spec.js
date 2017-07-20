const mongoose = require('../../src/db');
const urls = require('../../src/citymunch/click-through-urls');

after(() => {
    mongoose.disconnect(() => {
        mongoose.models = {};
    });
});

describe('Click-through URLs', () => {
    const EXPECTED_URL_FORMAT = /^https:\/\/slackbot\.citymunchapp\.com\/c\/[A-Z0-9]+$/;

    describe('getRestaurantUrl()', () => {
        it('should create a URL', (done) => {
            urls.getRestaurantUrl('qw4509w560j9i609i', 'T123')
                .then(url => {
                    if (EXPECTED_URL_FORMAT.test(url)) {
                        done();
                    } else {
                        done(new Error('Unexpected URL: ' + url));
                    }
                })
                .catch(() => done(new Error()));
        });
    });
});
