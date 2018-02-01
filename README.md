# Trustless Relay

**WARNING:**
This package is still in development. The contracts are in no way production ready.

This repo implements the Trustless Relay contract. For more information on the Trustless Relay concept, see: https://blog.gridplus.io/efficiently-bridging-evm-blockchains-8421504e9ced

## Setup

In order to run tests against the contract, you need to have truffle installed globally:

```
npm install -g truffle
```

You also need to include a `secrets.json` in this directory of form:

```
{
  "mnemonic": "public okay smoke segment forum front animal extra appear online before various cook test arrow",
  "hdPath": "m/44'/60'/0'/0/"
}
```

Finally, you need to install the `tokens` package:

```
truffle install tokens
```

## Booting Parity Networks

Unfortunately, TestRPC/Ganache are incompatible with these tests because they do not provide `v`, `r`, `s` signature parameters for transactions. I have
submitted an [issue](https://github.com/trufflesuite/ganache/issues/294) but in the meantime we can use parity. I have included a convenience script to
boot multiple parity instances with one command. All instances will have instant sealing. Unfortunately, this will be a lot slower than using TestRPC/Ganache, but it should still work.

In order to run the tests, start parity with:

```
npm run parity 7545 8545
```

## Testing

In order to run the tests, you need to have two Ethereum clients running and specified in `truffle.js` (default on ports `7545` and `8545`).

```
truffle compile
truffle test
```
