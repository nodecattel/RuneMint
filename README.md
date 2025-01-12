# Bellscoin RuneMint Configuration Guide

## Basic Setup

### 1. Install Dependencies
```bash
bun i
```

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

## Configuration Options

### Wallet Configuration
```env
# Required: Your private key in WIF format
PRIVATE_KEY="your_private_key_in_WIF_format"

# Optional: Destination address for minted runes
# If empty, runes will be sent back to the source address
DESTINATION_ADDRESS=""
```

### Network Configuration
```env
# Choose between "mainnet" or "testnet"
NETWORK="mainnet"

# RPC Configuration (for local Bells Core)
# Set to "true" to use local RPC instead of remote API
USE_LOCAL_RPC="false"

### Minting Configuration

# Number of transactions to create (max 1000)
MINT_COUNT=200

# Fee rate in sat/vB
FEE_RATE=50
```

### Rune Configuration
```env
# Rune ID (e.g., 1 for NINTONDO, 355895 for BELL•SEX•MACHINE))
RUNE_ID=1

# Rune symbol number (e.g., 0 for NINTONDO, 1 for BELL•SEX•MACHINE)
RUNE_NUMBER=0

# Amount of runes to mint per transaction
# e.g., RUNE_AMOUNT=1 means 1 rune per tx
# If MINT_COUNT=200 and RUNE_AMOUNT=1, total minted = 200 runes
RUNE_AMOUNT=1
```

## Example Configurations

### Standard NINTONDO Minting
```env
PRIVATE_KEY="your_private_key"
DESTINATION_ADDRESS=""
NETWORK="mainnet"
MINT_COUNT=200
FEE_RATE=50
RUNE_ID=1
RUNE_NUMBER=0
RUNE_AMOUNT=1
```

### BELL•SEX•MACHINE Minting
```env
PRIVATE_KEY="your_private_key"
DESTINATION_ADDRESS="destination_address"
NETWORK="mainnet"
MINT_COUNT=200
FEE_RATE=50
RUNE_ID=355895
RUNE_NUMBER=1
RUNE_AMOUNT=69  # 69 runes per tx = 13,800 total runes
```

### Testnet Testing
```env
PRIVATE_KEY="your_testnet_private_key"
DESTINATION_ADDRESS=""
NETWORK="testnet"
MINT_COUNT=10
FEE_RATE=1
RUNE_ID=1
RUNE_NUMBER=0
RUNE_AMOUNT=1
```

## Important Notes

1. **Transaction Count**: 
   - MINT_COUNT determines the number of transactions
   - Each transaction uses one UTXO
   - Maximum MINT_COUNT is 1000

2. **Total Runes**:
   - Total runes minted = MINT_COUNT × RUNE_AMOUNT
   - Example: MINT_COUNT=200 and RUNE_AMOUNT=5 will mint 1,000 total runes

3. **UTXOs**:
   - Each transaction requires one UTXO
   - Ensure you have enough UTXOs for your MINT_COUNT
   - If insufficient UTXOs, script will attempt to consolidate

4. **Network Fees**:
   - FEE_RATE is in satoshis per vByte
   - Higher rates = faster confirmation
   - Adjust based on network conditions

## Running the Minter
```bash
bun runes.ts
```
or

```bash
bun etch
```
## Security Considerations

1. Never share your private key
2. Keep your `.env` file secure
3. Add `.env` to your `.gitignore`
4. Use testnet for testing configurations
5. Verify addresses before large mints

## Support and Donations

Bellscoin RuneMint is open-source and community funded. 
If you can, please consider donating!

Donation Address: [bel1qs0k3zuv7achxquxhs3rqjjc93tc3hc6dfmnv2z](https://nintondo.io/explorer/address/bel1qs0k3zuv7achxquxhs3rqjjc93tc3hc6dfmnv2z)

Bellscoin received will go towards funding maintenance and development of Bells ecosystem.
