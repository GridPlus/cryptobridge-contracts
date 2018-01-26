// Boot a parity PoA chain (single node) with one or more specified ports
const Promise = require('bluebird').Promise;
const secrets = require('../secrets.json');
const bip39 = require('bip39');
const hdkey = require('ethereumjs-wallet/hdkey');
const ethWallet = require('ethereumjs-wallet');
const fs = require('fs');
const jsonfile = require('jsonfile');
const spawn = require('child_process').spawn;
const Spectcl = require('spectcl');

// The password that will be used for accounts (these are temporary accounts on
// private chains)
const password = 'password';
// Create a directory for the poa chain data if it doesn't exist
const DATA_DIR = `${process.cwd()}/parity/chains`;
if(fs.existsSync(DATA_DIR)) { rmrfDirSync(DATA_DIR) };
fs.mkdirSync(DATA_DIR);
// Get rid of the networks file - we will be updating it
const networksF = `${process.cwd()}/networks.json`;
if(fs.existsSync(networksF)) {
  fs.unlinkSync(networksF);
};
// Create a bunch of config filges given ports specified in the script arguments
const ports = process.argv.slice(2)

// Pull wallets out of the secret mnemonic
const wallets = generateFirstWallets(5, [], 0);
let keystores = [];
let addrs = [];

// ============================================================================
// MAIN FUNCTION
// ============================================================================
Promise.map(ports, (_port, i) => {
  const port = parseInt(_port);
  const PATH = `${DATA_DIR}/${port}`;
  const chainName = `LocalPoA_${port}`;
  if(!fs.existsSync(PATH)) {
    fs.mkdirSync(PATH);
    fs.mkdirSync(`${PATH}/keys`);
    fs.mkdirSync(`${PATH}/keys/${chainName}`);
  }


  Promise.map(wallets, (wallet) => {
    addrs.push(wallet[0]);
    const keystore = ethWallet.fromPrivateKey(Buffer.from(wallet[1].slice(2), 'hex'));
    const keystore2 = keystore.toV3String(password);
    keystores.push(keystore);
    fs.writeFileSync(`${PATH}/keys/${chainName}/${wallet[0]}`, keystore2);
    return;
  })
  .then(() => {
    let tmpConfig = genConfig(chainName, port);
    addrs.forEach((addr) => {
      tmpConfig.accounts[addr] = { "balance": "1000000000000000000000" };
    });
    jsonfile.writeFile(`${PATH}/config.json`, tmpConfig, { spaces: 2 }, () => {

      // Create a signer for the chain
      const session = new Spectcl();
      const cmd = `parity account new --chain ${PATH}/config.json --keys-path ${PATH}/keys`;
      session.spawn(cmd)
      session.expect([
        'Type password:', function(match, matched, outer_cb){
          session.send(`${password}\n`);
          session.expect([
            'Repeat password:', function(match, matched, inner_cb){
              session.send(`${password}\n`);
              inner_cb()
            }], function(err){
              outer_cb()
            }
          )
        }
      ], function(err){
        if (err) { throw err; }
        // NOTE: I had to add a timeout because there was a race condition.
        // 300ms seems to work but if you're getting errors try increasing it.
        setTimeout(() => {
          // // Get address from the new wallet
          jsonfile.readFile(`${PATH}/config.json`, (err, file) => {
            // Add signer to it
            const fnames = fs.readdirSync(`${PATH}/keys/${chainName}`);
            let fname;
            fnames.forEach((f) => {
              if (f.substring(0, 5) == 'UTC--') { fname = f; }
            });
            const _k = fs.readFileSync(`${PATH}/keys/${chainName}/${fname}`);
            const k = JSON.parse(_k);
            const signer = `0x${k.address}`;
            let config = file;
            config.accounts[signer] = { "balance": "1000000000000000000000" };
            jsonfile.writeFile(`${PATH}/config.json`, config, { spaces: 2}, () => {
              // Spawn the parity process
              const access = fs.createWriteStream(`${PATH}/log`, { flags: 'a' });
              const error = fs.createWriteStream(`${PATH}/error.log`, { flags: 'a' });
              // Allow web sockets (for listening on events)
              const wsPort = String(port + 1);

              // Set up parity config
              let args = ['--chain', `${PATH}/config.json`, '-d', `${PATH}/data`,
                '--jsonrpc-port', String(port), '--ws-port', wsPort, '--port', String(port+2),
                '--ui-port', String(port+3),
                '--jsonrpc-apis', 'web3,eth,net,personal,parity,parity_set,traces,rpc,parity_accounts',
                '--author', signer, '--engine-signer', signer, '--reseal-on-txs', 'all', '--force-sealing',
                '--rpccorsdomain', '*', '--jsonrpc-interface', 'all', '--reseal-max-period', '0', '--reseal-min-period', '0',
                '--jsonrpc-hosts', 'all', '--keys-path', `${PATH}/keys`, '--no-persistent-txqueue'];

              // Unlock signer AND first 5 addresses from seed phrase
              let unlock = signer;
              addrs.forEach((addr) => { unlock += `,${addr}`; })
              let pwfile = `${DATA_DIR}/../pw`
              args.push('--unlock');
              args.push(unlock);
              args.push('--password');
              args.push(pwfile);

              const parity = spawn('parity', args, { stdio: 'pipe', cwd: PATH });
              parity.stdout.pipe(access);
              parity.stderr.pipe(error);
              parity.on('close', () => {
                setTimeout(() => {
                  console.log(new Date(), `Parity killed (RPC port ${port})`);
                }, 500);
              });

              console.log(`${new Date()} Parity PoA chain #${i} started. RPC port=${port} WS port=${wsPort}`);
            })
          });
        }, 500)
      })
    });
  })
})


function rmrfDirSync(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index){
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        rmrfDirSync(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

function genConfig(name, port) {
  const config = {
    name: name,
    engine: {
      instantSeal: null
    },
    params: {
      gasLimitBoundDivisor: "0x400",
      maximumExtraDataSize: "0x20",
      minGasLimit: "0x1312d00",
      networkID: `0x${port.toString(16)}`,
      "eip140Transition": "0x0",
      "eip211Transition": "0x0",
      "eip214Transition": "0x0",
      "eip658Transition": "0x0"
    },
    "genesis": {
        "seal": {
          "generic": "0x0"
        },
        "difficulty": "0x20000",
        "author": "0x0000000000000000000000000000000000000000",
        "timestamp": "0x00",
        "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "extraData": "0x",
        "gasLimit": "0x1312d00"
    },
    accounts: {
      "0x0000000000000000000000000000000000000001": { "balance": "1", "builtin": { "name": "ecrecover", "pricing": { "linear": { "base": 3000, "word": 0 } } } },
      "0x0000000000000000000000000000000000000002": { "balance": "1", "builtin": { "name": "sha256", "pricing": { "linear": { "base": 60, "word": 12 } } } },
      "0x0000000000000000000000000000000000000003": { "balance": "1", "builtin": { "name": "ripemd160", "pricing": { "linear": { "base": 600, "word": 120 } } } },
      "0x0000000000000000000000000000000000000004": { "balance": "1", "builtin": { "name": "identity", "pricing": { "linear": { "base": 15, "word": 3 } } } },
      "0x0000000000000000000000000000000000000005": { "builtin": { "name": "modexp", "activate_at": "0x0", "pricing": { "modexp": { "divisor": 20 } } } },
      "0x0000000000000000000000000000000000000006": { "builtin": { "name": "alt_bn128_add", "activate_at": "0x0", "pricing": { "linear": { "base": 500, "word": 0 } } } },
      "0x0000000000000000000000000000000000000007": { "builtin": { "name": "alt_bn128_mul", "activate_at": "0x0", "pricing": { "linear": { "base": 40000, "word": 0 } } } },
      "0x0000000000000000000000000000000000000008": { "builtin": { "name": "alt_bn128_pairing", "activate_at": "0x0", "pricing": { "alt_bn128_pairing": { "base": 100000, "pair": 80000 } } } }
    }
  };
  return config;
}

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
