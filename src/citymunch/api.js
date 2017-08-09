'use strict';

const https = require('https');
const config = require('../../config/server');

function doRequest(method, path) {
    console.log(`CM API request: ${method} ${config.citymunchApiHostname}${path}`);

    return new Promise(function(resolve, reject) {
        https.request(
            {
                hostname: config.citymunchApiHostname,
                path: path,
                method: method,
                headers: {
                    'Authorization': 'Partner ' + config.citymunchApiKey,
                    'Accept': 'application/vnd.citymunch.v14+json',
                },
            },
            function (res) {
                let jsonString = '';
                res.on('data', data => jsonString += data);
                res.on('end', () => {
                    if (jsonString) {
                        const json = JSON.parse(jsonString);
                        resolve(json);
                    } else {
                        resolve();
                    }
                });
            })
            .on('error', (error) => {
                reject(error);
            })
            .end();
    });
}

module.exports = {
    get: (path) => doRequest('GET', path),
};
