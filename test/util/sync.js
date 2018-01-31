const Promise = require('bluebird').Promise;
const blocks = require('./blocks.js');
const fs = require('fs');
const path = `${process.cwd()}/lastBlock`;

exports.fsSync = fsSync
exports.syncChain = syncChain;


function syncChain(web3, lastBlockNumber=null, lastHeader=null, w=false) {
  return new Promise((resolve, reject) => {
    let targetBlock;
    if (lastBlockNumber == 0) { lastBlockNumber = null; }
    web3.eth.getBlockNumber()
    .then((n) => {
      targetBlock = n;
      console.log('blockn', n)
      console.log('lastHeader', lastHeader)
      console.log('lastBlockNumber', lastBlockNumber)
      return blocks.getHeaders(lastBlockNumber, n, web3, [lastHeader])
    })
    .then((headers) => {
      const lastHeader = headers[headers.length - 1] || 0;
      if (w) { fs.writeFileSync(path, `${lastHeader},${targetBlock}`); }
      console.log('returning ', lastHeader, targetBlock)
      return resolve([lastHeader, targetBlock]);
    })
    .catch((err) => { return reject(err); })
  })
}

function fsSync(web3) {
  return new Promise((resolve, reject) => {
    let targetBlock
    if (fs.existsSync(path)) {
       const f = fs.readFileSync(path).toString('utf8');
       return resolve(f.split(','));
    } else {
      web3.eth.getBlockNumber()
      .then((n) => {
        targetBlock = n;
        return blocks.getHeaders(0, n, web3)
      })
      .then((headers) => {
        const lastHeader = headers[headers.length - 1];
        if (path) { fs.writeFileSync(path, `${lastHeader},${targetBlock}`); }
        return resolve([lastHeader, targetBlock]);
      })
      .catch((err) => { return reject(err); })
    }
  })
}
