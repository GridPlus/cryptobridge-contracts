const bip39 = require('bip39');
const hdkey = require('ethereumjs-wallet/hdkey');
const secrets = require('../secrets.json');
const Web3 = require('web3');
const leftPad = require('left-pad');

const argv = require('yargs')
  .usage('Usage: <cmd> [options]')
  .command('--to', 'Address to send tokens to, 0x prefixed')
  .command('--from', 'Address to send tokens from. Must be in set of accounts (--accounts to list)')
  .alias('-f', '--from')
  .command('--accounts', 'List accounts that can send tokens')
  .alias('-a', '--accounts')
  .command('--token', 'Address of token to send')
  .command('--number', 'Number of tokens to send (default 1)')
  .alias('-n', '--number')
  .command('--host', 'Host of the chain to query (default localhost:8545)')
  .alias('-h', '--host')
  .argv;

const host = argv.host ? argv.host : 'http://localhost:7545';
console.log('host', host)
const provider = new Web3.providers.HttpProvider(host);
const web3 = new Web3(provider);

// Send some tokens from the main account to the desired recipient
function generateFirstWallets(n, _wallets, hdPathIndex) {
  const hdwallet = hdkey.fromMasterSeed(bip39.mnemonicToSeed(secrets.mnemonic));
  const node = hdwallet.derivePath(secrets.hdPath + hdPathIndex.toString());
  const secretKey = node.getWallet().getPrivateKeyString();
  const addr = node.getWallet().getAddressString();
  _wallets.push([addr, secretKey]);
  const nextHDPathIndex = hdPathIndex + 1;
  if (nextHDPathIndex >= n) {
    return _wallets;
  }
  return generateFirstWallets(n, _wallets, nextHDPathIndex);
}

// First 4 default accounts (wallets[0] is not in the set)
const wallets = generateFirstWallets(5, [], 0);
if (argv.accounts) {
  console.log('Listing accounts you can send tokens from')
  wallets.forEach((w, i) => { console.log(`[${i}]\t${w[0]}`)})
} else {
  if (!argv.to) { console.log('You must specify who to send to (--to)'); }
  if (!argv.from) { argv.from = wallets[1][0]; }
  const n = argv.number ? argv.number : 1;
  const gas = 100000;
  let tx = {
    from: argv.from,
    gas
  }
  if (!argv.token) {
    tx.value = parseInt(n);
    tx.to = argv.to;
  } else {
    tx.data = `0xa9059cbb${leftPad(argv.to.slice(2), 64, '0')}${leftPad(n.toString(16), 64, '0')}`;
    tx.to = argv.token;
  }
  web3.eth.sendTransaction(tx, (err, res) => {
    if (err) { console.log('Error sending token: ', err); }
    else {
      web3.eth.getTransactionReceipt(res, (err, receipt) => {
        if (err) { console.log(`Error getting transaction receipt: ${err}`); }
        else if (argv.token && receipt.logs.length < 1) { console.log('Error sending transaction. Are you sure you have enough tokens to send?'); }
        else { console.log(`${n} tokens (${argv.token ? argv.token : 'ether'}) successfully sent to ${argv.to}`)}
      })
    }
  })
}
