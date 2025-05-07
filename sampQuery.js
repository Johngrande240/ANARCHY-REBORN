
const samp = require('samp-query');

const options = {
    host: 'newlife-rp.ph-host.xyz',
    port: 7777
};

function queryServer() {
    return new Promise((resolve, reject) => {
        samp(options, (error, response) => {
            if (error) {
                console.error("Failed to query SAMP server:", error);
                reject(error);
                return;
            }
            resolve(response);
        });
    });
}

module.exports = { queryServer };

