const chai = require('chai');
const expect = chai.expect;
const utils = require('../../src/utils');

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
});
