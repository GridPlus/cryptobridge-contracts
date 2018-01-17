// Functions for the validators (signatures, messaging)
const ethutil = require('ethereumjs-util');
const leftPad = require('left-pad');
const sha3 = require('solidity-sha3').default;

// Get the formatted message for signing. Should be replicable in solidity
function getMsg(headerRoot, chain, start, end) {
  const solStart = leftPad(start.toString(16), 64, '0');
  const solEnd = leftPad(end.toString(16), 64, '0');
  const msg = `0x${headerRoot.slice(2)}${chain.slice(2)}${solStart}${solEnd}`;
  return sha3(msg);
}

// Get signature on a piece of data
function sign(msg, wallet) {
  const msgBuf = Buffer.from(msg.slice(2), 'hex');
  const pkey = Buffer.from(wallet[1].slice(2), 'hex');
  const sigTmp = ethutil.ecsign(msgBuf, pkey);
  const newSig = {
    r: leftPad(sigTmp.r.toString('hex'), 64, '0'),
    s: leftPad(sigTmp.s.toString('hex'), 64, '0'),
    v: leftPad(sigTmp.v.toString(16), 64, '0'),
  };
  return newSig;
}

function formatSigs(sigs) {
  let data = '0x';
  sigs.forEach((sig) => {
    const tmp = `${sig.r}${sig.s}${sig.v}`;
    data += tmp;
  })
  return data;
}

exports.formatSigs = formatSigs;
exports.getMsg = getMsg;
exports.sign = sign;
