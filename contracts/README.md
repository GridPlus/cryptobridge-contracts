# Trustless Relay

This repo implements the Trustless Relay contract. For more information on the Trustless Relay concept, see:

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
