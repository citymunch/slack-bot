const chai = require('chai');
const expect = chai.expect;
const utils = require('../../src/utils');
const LocalDate = require('local-date-time').LocalDate;
const LocalTime = require('local-date-time').LocalTime;

describe('Utils', () => {
    describe('normalizeSearchInput()', () => {
        const normalize = utils.normalizeSearchInput;

        it('should remove unnecessary whitespace', () => {
            expect(normalize('  chinese \n \t\t  food  ')).to.equal('chinese food');
        });

        it('should convert to lowercase', () => {
            expect(normalize('CHINESE')).to.equal('chinese');
        });
    });

    describe('formatLocalDate()', () => {
        const format = utils.formatLocalDate;

        it('should format local dates', () => {
            expect(format(LocalDate.of('2017-05-23'))).to.equal('23 May 2017');
        });
    });

    describe('formatLocalTime()', () => {
        const expectEqual = (input, output) => {
            expect(utils.formatLocalTime(LocalTime.of(input)))
                .to.equal(output)
        };

        it('should format 00:00 and 12:00 as 12am', function() {
            expectEqual('00:00', '12am');
            expectEqual('24:00', '12am');
        });

        it('should format 12:00 as 12pm', function() {
            expectEqual('12:00', '12pm');
        });

        it('should format other times', function() {
            expectEqual('01:00', '1am');
            expectEqual('09:05', '9:05am');
            expectEqual('13:00', '1pm');
            expectEqual('23:59', '11:59pm');
        });
    });
});
