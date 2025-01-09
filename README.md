Install
------
bun i

Configure
------
**Create a P2WPKH (SegWit) Address:** Generate a Pay-to-Witness-Public-Key-Hash address.

**Fund the Address:** Deposit funds into this address.


**Parameters**

In file runes.ts:

**PRIVATE_KEY:** Enter your private key here.

**FEE_RATE:** Specify the fee rate you're willing to pay for each mint transaction in satoshis per virtual byte (sat/vB).

**MINT_COUNT:** Define how many mint transactions will be batched together. Your initial deposit will be divided into this number of parts, with each part used for one mint transaction.


**Initial Configuration:**

The project is set up to mint the rune named NINTONDO with the ID 1:0. You can view this rune at:

https://ord.nintondo.io/rune/NINTONDO


**Changing the Rune:**

To mint a different rune, modify the RuneId parameters in the following code:

```const mintstone = new Runestone([], none(), some(new RuneId(1, 0)), some(1));```

Run
------

bun runes.ts

Donate
------

Bellscoin RuneMint is open-source and community funded. 

If you can, please consider donating!

The donation address is
[bel1qs0k3zuv7achxquxhs3rqjjc93tc3hc6dfmnv2z](https://nintondo.io/explorer/address/bel1qs0k3zuv7achxquxhs3rqjjc93tc3hc6dfmnv2z).

Bellscoin received will go towards funding maintenance and development of Bells ecosystem.

Thank you for donating!
