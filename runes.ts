import { networks, payments, Psbt, address as baddr } from "belcoinjs-lib";
import ECPairFactory from "belpair";
import { none, RuneId, Runestone, some } from "runelib";
import * as ecc from "bells-secp256k1";
import dotenv from 'dotenv';
import ora from 'ora';
import chalk from 'chalk';
import { getFeeEstimate } from './fee-utils';

// Load environment variables
dotenv.config();

// Environment variables validation
if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is required in .env file");
}

// Update the RPC configuration
const RPC_CONFIG = {
  url: process.env.RPC_URL || "http://localhost:19918",
  username: process.env.RPC_USER || "nodecattel",
  password: process.env.RPC_PASS || "nodecatteL",
  wallet: process.env.RPC_WALLET || "wallet"
};

// Configuration from environment variables
const CONFIG = {
  network: process.env.NETWORK === "testnet" ? networks.testnet : networks.bellcoin,
  privateKey: process.env.PRIVATE_KEY,
  destinationAddress: process.env.DESTINATION_ADDRESS || "",
  mintCount: parseInt(process.env.MINT_COUNT || "1000"),
  feeRate: parseInt(process.env.FEE_RATE || "135"),
  rune: {
    id: parseInt(process.env.RUNE_ID || "351349"),
    number: parseInt(process.env.RUNE_NUMBER || "1"),
    amount: parseInt(process.env.RUNE_AMOUNT || "1000")
  },
  rpc: {
    useLocal: process.env.USE_LOCAL_RPC === "true",
  },
  maxRetries: parseInt(process.env.MAX_RETRIES || "3"),
  useLocal: process.env.USE_LOCAL_RPC === "true",
  preferredConfirmation: parseInt(process.env.PREFERRED_CONFIRMATION || "3"),
};

const ECPair = ECPairFactory(ecc);

const API_URLS = {
  testnet: "https://testnet.nintondo.io/electrs",
  mainnet: "https://api.nintondo.io/api",
};

async function callRPC(method: string, params: any[]) {
  const response = await fetch(`${RPC_CONFIG.url}/wallet/${RPC_CONFIG.wallet}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${RPC_CONFIG.username}:${RPC_CONFIG.password}`).toString('base64')
    },
    body: JSON.stringify({
      jsonrpc: "1.0",
      id: "runes",
      method,
      params
    })
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }
  return data.result;
}

async function mint(batchSize: number) {
  const mintstone = new Runestone(
    [], 
    none(), 
    some(new RuneId(CONFIG.rune.id, CONFIG.rune.number)), 
    some(1)
  );

  const keyPair = ECPair.fromWIF(CONFIG.privateKey, CONFIG.network);

  const { address } = payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network: CONFIG.network,
  });

  const minRequired = calculateFee(1, 3, CONFIG.feeRate); // Updated for 3 outputs

  let utxos = await getUtxos(address as string).then((utxos) =>
    utxos
      ?.filter((utxo) => utxo.value >= minRequired + 1000)
      .slice(0, batchSize)
      .toSorted((a, b) => b.value - a.value)
  );

  if (!utxos) {
    throw new Error("No UTXOs found");
  }

  if (utxos.length < batchSize) {
    const available = utxos
      .slice(0, 300)
      .reduce((prev, cur) => cur.value + prev, 0);

    if (available < minRequired * batchSize) {
      throw new Error(
        "Insufficient funds or you need to consolidate UTXOs first"
      );
    }

    const fee = calculateFee(utxos.length, batchSize, CONFIG.feeRate);
    const psbt = new Psbt({ network: CONFIG.network });

    utxos.slice(0, 300).forEach((utxo) => {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          value: utxo.value,
          script: baddr.toOutputScript(address as string, CONFIG.network),
        },
      });
    });

    let value = Math.floor((available - fee) / batchSize);

    for (let i = 0; i < batchSize; i++) {
      psbt.addOutput({
        script: baddr.toOutputScript(address as string, CONFIG.network),
        value,
      });
    }

    psbt.signAllInputs(keyPair);
    psbt.finalizeAllInputs();

    return [psbt.extractTransaction().toHex()];
  }

  let txs = [];

  for (const utxo of utxos) {
    const mintPsbt = new Psbt({ network: CONFIG.network });

    mintPsbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: utxo.value,
        script: baddr.toOutputScript(address as string, CONFIG.network),
      },
    });

    // First output: OP_RETURN for rune
    mintPsbt.addOutput({
      script: mintstone.encipher(),
      value: 0,
    });

    // Second output: Minimal amount to destination
    mintPsbt.addOutput({
      address: CONFIG.destinationAddress || address as string,
      value: 1000, // Minimal dust amount
    });

    // Third output: Change back to source address
    mintPsbt.addOutput({
      address: address as string,
      value: utxo.value - minRequired - 1000, // Change minus fees and dust amount
    });

    mintPsbt.signAllInputs(keyPair);
    mintPsbt.finalizeAllInputs();
    txs.push(mintPsbt.extractTransaction().toHex());
  }

  return txs;
}

function calculateFee(
  inputCount: number,
  outputCount: number,
  feeRate: number
) {
  const BASE_TX_WEIGHT = 10 * 4;
  const INPUT_WEIGHT = 68 * 4;
  const OUTPUT_WEIGHT = 31 * 4;

  const transactionWeight =
    (inputCount === 0 ? 0 : BASE_TX_WEIGHT) +
    inputCount * INPUT_WEIGHT +
    outputCount * OUTPUT_WEIGHT;

  const fee = Math.ceil((transactionWeight / 4) * feeRate);

  return fee;
}

interface Utxo {
  txid: string;
  vout: number;
  value: number;
  hex: string;
}

const getUtxos = async (
  address: string,
  opts?: {
    amount?: number;
    disableHex?: boolean;
  }
): Promise<Utxo[] | undefined> => {
  try {
    if (CONFIG.useLocal) {
      const result = await callRPC("listunspent", [1, 9999999, [address]]);
      return result.map((utxo: any) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: Math.round(utxo.amount * 100000000),
        hex: utxo.scriptPubKey
      }));
    } else {
      const params = new URLSearchParams();
      if (typeof opts?.amount === "number") {
        params.set("amount", opts?.amount.toString());
      }
      if (!opts?.disableHex) {
        params.set("hex", "true");
      }

      const res = await fetch(
        API_URLS[CONFIG.network === networks.testnet ? "testnet" : "mainnet"] +
          `/address/${address}/utxo?${params.toString()}`
      );
      return await res.json();
    }
  } catch (error) {
    console.error(chalk.red('Error fetching UTXOs:', error));
    return undefined;
  }
};

const checkedPushTx = async (txHex: string) => {
  try {
    if (CONFIG.useLocal) {
      const txid = await callRPC("sendrawtransaction", [txHex]);
      console.log(`Successfully pushed transaction ${txid}`);
      return txid;
    } else {
      const response = await fetch(RPC_CONFIG.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from(`${RPC_CONFIG.username}:${RPC_CONFIG.password}`).toString('base64')
        },
        body: JSON.stringify({
          jsonrpc: "1.0",
          id: "runes",
          method: "sendrawtransaction",
          params: [txHex]
        })
      });

      const data = await response.json();
      if (data.error) {
        if (data.error.message.includes("Transaction already in block chain") ||
            data.error.message.includes("bad-txns-inputs-missingorspent")) {
          return true;
        }
        console.error(chalk.red(data.error.message));
        return undefined;
      }

      const txid = data.result;
      console.log(chalk.green(`Successfully pushed transaction ${txid}`));
      return txid;
    }
  } catch (error) {
    if (error instanceof Error) {
      const errorMessage = error.message;
      if (errorMessage.includes("Transaction already in block chain") ||
          errorMessage.includes("bad-txns-inputs-missingorspent")) {
        return true;
      }
      console.error(chalk.red(errorMessage));
    } else {
      console.error(chalk.red('Error sending transaction:', error));
    }
    return undefined;
  }
};

function printMintInfo() {
  console.log(chalk.yellow("\nRunestone Configuration:"));
  console.log(chalk.yellow(`Rune ID: ${CONFIG.rune.id}`));
  console.log(chalk.yellow(`Rune Number: ${CONFIG.rune.number}`));
  console.log(chalk.yellow(`Rune Amount in Config: ${CONFIG.rune.amount}`));
  console.log(chalk.yellow(`Original Fee Rate: ${Math.floor(CONFIG.feeRate / 1.5)} sat/vB`));
  console.log(chalk.yellow(`Buffered Fee Rate (50% increase): ${CONFIG.feeRate} sat/vB`));
  console.log(chalk.yellow("\nActual Runestone creation:"));
  console.log(chalk.yellow(`new Runestone([], none(), some(new RuneId(${CONFIG.rune.id}, ${CONFIG.rune.number})), some(1))`));
}

async function main() {
  console.log(chalk.blue("Starting rune minting..."));
  console.log(chalk.blue(`Network: ${CONFIG.network === networks.testnet ? "testnet" : "mainnet"}`));
  console.log(chalk.blue(`Using ${CONFIG.useLocal ? "local RPC" : "remote API"}`));
  
  // Fetch dynamic fee rate
  const originalFeeRate = await getFeeEstimate(CONFIG.preferredConfirmation);
  const bufferedFeeRate = Math.ceil(originalFeeRate * 1.5);
  CONFIG.feeRate = bufferedFeeRate;
  
  console.log(chalk.blue(`Original fee rate: ${originalFeeRate} sat/vB`));
  console.log(chalk.blue(`Buffered fee rate (50% increase): ${bufferedFeeRate} sat/vB`));
  console.log(chalk.blue(`Minting ${CONFIG.mintCount} transactions of ${CONFIG.rune.amount} runes each`));
  console.log(chalk.blue(`Total runes to mint: ${CONFIG.mintCount * CONFIG.rune.amount}`));

  printMintInfo();

  console.log(chalk.cyan("\nStarting in 10 seconds..."));
  await new Promise(resolve => setTimeout(resolve, 10000));

  let successfulMints = 0;
  let failedMints = 0;

  const spinner = ora(`Minting runes`).start();

  try {
    const toPush = await mint(CONFIG.mintCount);
    
    for (const tx of toPush) {
      let retries = 0;
      while (retries < CONFIG.maxRetries) {
        const res = await checkedPushTx(tx);
        if (typeof res === "string" || (typeof res === "boolean" && res === true)) {
          successfulMints++;
          break;
        } else {
          retries++;
          if (retries < CONFIG.maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }
      if (retries === CONFIG.maxRetries) {
        failedMints++;
      }
    }

    spinner.succeed(`Minting completed`);
  } catch (error) {
    spinner.fail(`Minting failed`);
    console.error(chalk.red(`Error during minting:`, error));
    failedMints = CONFIG.mintCount;
  }

  console.log("\nMinting process completed!");
  console.log(`Successful mints: ${successfulMints}`);
  console.log(chalk.red(`Failed mints: ${failedMints}`));
  console.log(`Total runes minted: ${successfulMints * CONFIG.rune.amount}`);
}

main().catch(console.error);

