# Trustless Bridge Contracts

**WARNING:**
This package is functional, but is unaudited and in still in development. It should not be used in production systems with large amounts of value.

![Bridge](https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/360_Bridge_at_night%2C_2008.jpg/800px-360_Bridge_at_night%2C_2008.jpg)

This repo implements the Trustless Bridge contract. For more background on the Trustless Bridge/Relay concept, see [this article](https://blog.gridplus.io/efficiently-bridging-evm-blockchains-8421504e9ced).

# Bridge Basics

A bridge exists as two contracts (`Bridge.sol`) on two separate EVM-based blockchains. A set of participants may stake (`Bridge.stake()`) a specified token (`Bridge.stakeToken()`) to enter the pool of proposer candidates. Every time a piece of data is submitted to a bridge, a new proposer is chosen pseudorandomly (`Bridge.getProposer()`) with probability proportional to the participant's stake.

This proposer listens to the bridged blockchain and collects block headers until he/she is ready to submit data to the bridge contract on his/her origin blockchain (i.e. where he/she is currently the proposer). At such a time, the proposer packages the block headers into a Merkle root (note: for now, the number of headers being packaged must be a power of two) and includes the block number of the last packaged header (the starting block number is assumed to be 1 greater than the last checkpointed header in the previous header root saved to the Bridge).

With data in hand, the proposer passes `root, chainAddr, startBlock, endBlock` to the other staking participants, who are currently validators. Note that `chainAddr` corresponds to the address of the Bridge contract on the blockchain being bridged. If this root is consistent with the one the validators compute, they will sign the following hash: `keccak256(root, chainAddr, startBlock, endBlock)`, where arguments are tightly packed as they would be in Solidity (i.e. with numbers being left-padded to 32 bytes).

Once enough validators sign off (at least `Bridge.validatorThreshold()`), the proposer may submit the data to the bridge via `Bridge.proposeRoot()`. Assuming the signatures are correct, the proposer will be rewarded based on the current reward (`Bridge.reward()`). This is parameterized by `Bridge.updateReward()` and is a function of the number of blocks elapsed since the last root was checkpointed. This allows the proposer to wait until it is profitable to checkpoint the data (e.g. to wait out periods of high gas prices). Note that there is also a cutoff number of blocks, after which anyone may proposer a header with signatures and receive the reward. In future versions, this cutoff can be made into a random range to avoid proposers from waiting too long.

# APIs

The following is a set of APIs for the end user, stakers/proposer, and admin. If you would like to get started installing and testing this package, please skip to *Installation and Setup*

## User API

Users may deposit tokens on the bridge contract in their blockchain and withdraw them from the corresponding bridge contract in the destination blockchain. Since the proposer only relays a single Merkle root hash, the user has to prove a few things from several pieces of data.

### deposit (token, toChain, amount)

```
Function: deposit
Purpose: Deposit tokens so that they can be withdrawn on another chain.
Arguments:
  * token (address: the address of the token being deposited)
  * toChain (address: the address of the corresponding bridged blockchain, i.e where the coins will be withdrawn)
  * amount (uint256: amount to deposit)
```

#### Notes:

* This is done on the "origin" chain by the user. The user must give an allowance to the bridge contract ahead of time.

* NOTE: `Bridge.sol` v0.1 does not accept deposits or withdrawals of ether and is only compatable with ERC20 tokens. In future version, ether will be included as an allowable deposit or withdrawal token.

### prepWithdraw (nonce, gasPrice, gasLimit, v, r, s, addrs, amount, txRoot, path, parentNodes, netVersion)

```
Function: prepWithdraw
Purpose: Step 1 of withdrawal. Initialize a withdrawal and prove a transaction. Save the transaction root and other data.
Arguments:
  * nonce (bytes: account nonce of user in origin chain used in deposit transaction, hex formatted integer)
  * gasPrice (bytes: price of gas used in deposit transaction, hex integer)
  * gasLimit (bytes: maximum gas used in deposit transaction, hex integer)
  * v (bytes: value of v received from transaction receipt in origin chain, see note below)
  * r (bytes: value of r from the deposit transaction)
  * s (bytes: value of s from the deposit transaction)
  * addrs (address[3]: [fromChain, depositToken, withdrawToken]. fromChain = address of origin chain bridge contract, depositToken = address of token deposited in the origin chain, withdrawToken = address of mapped token in this chain)
  * amount (bytes: amount deposited in origin chain, hex integer, atomic units)
  * txRoot (bytes32: transactionsRoot from block in which the deposit was made on the origin chain)
  * path (bytes: path of deposit transaction in the transactions Merkle-Patricia tree)
  * parentNodes (bytes: concatenated list of parent nodes in the transaction Merkle-Patricia tree)
  * netVersion (bytes: version of the origin chain, only needed if v is EIP155 form, can be called from web3.version.network)
```

#### Notes:

* EIP155 changed `v` from `27`/`28` to `netVersion * 2 + 35`/`netVersion * 2 + 36`. Bridge maintainers who publish data should indicate which version is being used. v0.1 of `Bridge.sol` supports both. Parity treats EIP155 as the official `v` value and labels the previous version as `standardV`.
* `path` and `parentNodes` are produced by [eth-proof](https://github.com/zmitton/eth-proof). For more information, please see that library.
* All bytes arguments are unpadded, e.g. 0x02 would represent the number 2 (with one byte).

### proveReceipt (logs, cumulativeGas, logsBloom, receiptsRoot, path, parentNodes)

```
Function: proveReceipt
Purpose: Step 2 of withdrawal. Prove a receipt and save the receipts root to an existing pending withdrawal.
Arguments:
  * logs (bytes: encoded logs, see below)
  * cumulativeGas (bytes: amount of gas used after this transaction completed in the block, hex integer)
  * logsBloom (bytes: raw data from deposit transaction receipt)
  * receiptsRoot (bytes32: root of the receipts in the deposit's block)
  * path (bytes: path of the receipt in the receipt Merkle-Patricia tree)
  * parentNodes (bytes: concatenated list of parent nodes in the receipt Merkle-Patricia tree)
```

#### Notes:
* `logs` are encoded as a concatenated list of bytes:

  ```
  [ [addrs[0], [ topics[0], topics[1], topics[2]], data[0] ], [addrs[1], [ topics[3], topics[4], topics[5], topics[6] ], data[1] ] ]
  ```

  This is a fixed size because there are two events emitted: `Transfer` (ERC20) and `Deposit` (Bridge). `topics` correspond to the indexed log parameters in the order the appear in the contract's definition. `data` are the unindexed arguments. `addrs` correspond to the address of the contract that emitted the log (regardless of which blockchain it is deployed on). To see this encoding in action, see `encodeLogs()` in `test/util/receiptProof.js`. Note that the array returned by `encodeLogs()` must have each item encoded to hex and concatenated before sending the whole payload to `proveReceipt()`.    

### withdraw (blockNum, timestamp, prevHeader, rootN, proof)

```
Function: withdraw
Purpose: Step 3 of withdrawal. Prove block header and receive tokens.
Arguments:
  * blockNum (uint256: block number the block containing the deposit on the bridged blockchain)
  * timestamp (uint256: timestamp on the block containing the deposit on the bridged blockchain)
  * prevHeader (bytes32: the previous modified block header (NOT Ethereum block header), see note below for formatting)
  * rootN (uint256: index of the header root corresponding to the origin chain)
  * proof (bytes: concatenated Merkle proof, see note below for formatting)
```

#### Notes:

* Headers in this system are modified and only contain the following data:
    - Previous [modified] header (`bytes32(0)` if this is the genesis block)
    - Timestamp (from block)
    - Block number
    - Transactions root
    - Receipts root

* A normal Merkle proof is used for headers rather than a Merkle-Patricia tree. It is formatted as:

  ```
  partnerIsRight_i, partner_i], ...
  ```

  Where `partnerIsRight_i = 0x01` for `true` and `0x00` for false. For more details on implementation, see `test/util/merkle.js`. Note that the original leaf is *not* included in this proof.


### getTokenMapping (chain, token) constant

```
Function: getTokenMapping
Purpose: Get the token associated with your token from another chain. This will be your withdrawal token if you deposit the other one.
Arguments:
  * chain (address: the bridge contract on the origin chain where you would deposit your tokens)
  * token (address: the token you would deposit)
Returns:
  * address: the token you will receive as a withdrawal on this chain if you deposit your token on your chain
```

### getLastBlockNum (fromChain) constant

```
Function: getLastBlockNum
Purpose: Find the most recent block on the given chain that has been included in a proposed header root. If you have a deposit in a block less than or equal to this one on the provided chain, you may begin the withdrawal process.
Arguments:
  * fromChain (address: the bridge contract on the origin chain)
Returns:
  * uint256: last block on the origin chain that was relayed to this chain
```

## Staker API

Any participant may join a staking pool, but future versions may give the option to whitelist a set of participants.

### stake (amount)

```
Function: stake
Purpose: Join a staking pool or add to your stake in the pre-determined stakeToken.
Arguments:
 * amount (uint256: atomic units of staking token to add to the pool. This will credit your account with more stake.
```

#### Notes:

* In v0.1, once a participant has added stake, the proposer is subject to change, even for the current header root. This is to incentivize proposers to submit roots more quickly.

### destake (amount)

```
Function: destake
Purpose: Remove stake from a poo in the pre-determined stakeToken.
Arguments:
 * amount (uint256: atomic units of staking token to remove from the pool)
```

#### Notes:

* As with staking, in v0.1 this potentially changes the current proposer's identity. If you are the proposer, it is something to be aware of.
* In v0.1, there is currently no lock-up period, though one will likely be added in the future
* If the participant destakes the total amount currently staked, he/she will be removed from the pool entirely.

### proposeRoot (headerRoot, chainId, end, sigs)

```
Function: proposeRoot
Purpose: May only be called by elected proposer, submit a headerRoot and validator signatures and receive a reward in return.
Arguments:
 * headerRoot (bytes32: the Merkle root of the modified block headers since the last block checkpointed. See withdraw() notes on block header formatting. Ordering in Merkle tree is based on block number)
 * chainId (address: location of bridge contract on connected chain)
 * end (uint256: last block number in the header Merkle tree corresponding to the root being submited)
 * sigs (bytes: concatenated list of signatures of form 'r,s,v'. See notes on `prepWithdraw()` for instructions on formatting `v`)
```

#### Notes:

* The Merkle tree must begin with the block *after* the last block checkpoined in the previous Merkle root corresponding to this `chainId`. Although no explicit contract checks exist to ensure this range is a power of two, it is enforcced in the included test cases and is recommended.

### getProposer () constant

```
Function: getProposer
Purpose: Get the current proposer for all chains.
```

#### Notes:

* In the future, stakers will be able to enroll in watching specific chains and only be elected to those chains. For simplicity, in v0.1 each proposer is proposer of all bridged chains at the same time and may only publish one at a time before a new proposer is selected. This is really designed to only relay one chain at a time.
* The proposer is selected pseudorandomly based on the `epochSeed`, which is updated when a root is proposed.

## Admin API

Admin functionality is key to running a clean bridge. In v0.1, there is only one admin - the user who deploys the contract. In the future, this role can be delegated to the stakers or an elected representative.

### Bridge (token)

```
Function: default function
Purpose: Set admin and staking token
Arguments:
 * token (address: the staking token. Once set, this cannot be changed!)
```

### addToken (newToken, origToken, fromChain) onlyAdmin

```
Function: addToken
Purpose: Create a token and move all units to this bridge contract, then associate to a token on an existing bridge.
Arguments:
 * newToken (address: token on this blockchain to map)
 * origToken (address: token on fromChain to map)
 * fromChain (address: bridge contract on the bridged blockchain)
```

#### Notes:

* This function exists primarily to add trust to an admin's job of creating token mappings. It emits a separate event, so users can be sure the token was created correctly and all units were moved to the bridge contract (where the admin cannot withdraw them).
* This function is meant for the destination chain (e.g. a sidechain), where an asset must be replicated and mapped to an existing asset (e.g. on the mainnet).

### associateToken (newToken, origToken, toChain) onlyAdmin

```
Function: associateToken
Purpose: Associate an existing token to a replicated token.
Arguments:
 * newToken (address: newly replicated token on bridged blockchain)
 * origtoken (address: token on this blockchain to map)
 * fromChain (address: bridge contract on blockchain housing the replicated token)
```

#### Notes:

* This function complements `addToken`, which would be called on a sidechain. This function would be called on e.g. the mainnet. This exists because *both sides* of the bridge need to have the same token mapping (mirrored, of course).

### updateValidatorThreshold (newThreshold) onlyAdmin

```
Function: updateValidatorThreshold
Purpose: Change the number of validators required to propose a root
Arguments:
 * newThreshold (uint256: new number of validators needed to propose a root)
```

#### Notes:

* This function may be deprecated after v0.1

### updateReward (base, a, max)

```
Function: updateReward
Purpose: Change the reward issued to the proposer
Arguments:
 * base (uint256: minimum number of tokens rewarded for proposing a root)
 * a (uint256: number of tokens per additional block in the range of the root tree)
 * max (uint256: maximum number of tokens rewarded for proposing a root)
```

#### Notes:

* Based on the slope of this reward curve (`a`), the maximum may be reached more quickly with a change.
* Only the admin may call this function for now, but that may be changed in future versions

# Installation and Setup

## Installation

This package is not yet installable via EthPM. When it is, you will be able to install it as a dependency automatically via truffle. For now, you will need to manually copy the files. Note that they will be consolidated in future versions.

## Setup and Testing

In order to run tests against the contract, you should clone this repo and have truffle installed globally:

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

Further testing runs (with no contract changes) only require `truffle test`.

Should you make any changes to the contract files, make sure you `rm -rf build` before running `truffle compile && truffle test`.
