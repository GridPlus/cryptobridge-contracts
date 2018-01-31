const blocks = require('./blocks.js');
const fs = require('fs');

exports.sync = sync;
function sync(web3) {
  return new Promise((resolve, reject) => {
    const path = `${process.cwd()}/lastBlock`;
    if (fs.existsSync(path)) {
      const f = fs.readFileSync(path);
      console.log('f', f)
      return resolve(f.split(''))
    } else {
      web3.eth.getBlockNumber()
      .then((n) => {
        console.log('blockn', n)
        return blocks.getHeaders(1, n-1, web3)
      })
      .then((headers) => {
        const lastHeader = headers[headers.length - 1];
        const numHeaders = headers.length - 1
        fs.writeFileSync(path, `${lastHeader},${numHeaders}`);
        return resolve([lastHeader, numHeaders]);
      })
      .catch((err) => { return reject(err); })
    }
  })
}
