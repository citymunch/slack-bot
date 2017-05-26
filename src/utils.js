function normalizeSearchInput(text) {
    return text.toLowerCase().trim().replace(/\s{2,}/g, ' ');
}

module.exports = {
    normalizeSearchInput,
};

