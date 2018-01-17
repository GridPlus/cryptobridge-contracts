// Functions for the validators (signatures, messaging)
const ethutil = require('ethereumjs-util');
const leftPad = require('left-pad');

// Get the formatted message for signing. Should be replicable in solidity
function getMsg(start, end, headerRoot) {
  const solStart = leftPad(start.toString(16), '0', 64);
  const solEnd = leftPad(end.toString(16), '0', 64);
  console.log(ethutil)
  const msg = `0x${solStart}${solEnd}${headerRoot.slice(2)}`;
  const personal = ethutil.hashPersonalMessage(Buffer.from(msg, 'hex'));
  return `0x${personal.toString('hex')}`;
}

// Get signature on a piece of data
function sign(msg, wallet) {
  const msgBuf = Buffer.from(msg.slice(2), 'hex');
  const pkey = Buffer.from(wallet[1].slice(2), 'hex');
  const sigTmp = ethutil.ecsign(msgBuf, pkey);
  const newSig = {
    r: `0x${leftPad(sigTmp.r.toString('hex'), 64, '0')}`,
    s: `0x${leftPad(sigTmp.s.toString('hex'), 64, '0')}`,
    v: sigTmp.v,
  };
  return newSig;
}

exports.getMsg = getMsg;
exports.sign = sign;
