import { networks, payments, Psbt, address as baddr } from "belcoinjs-lib";
import ECPairFactory from "belpair";
import { none, RuneId, Runestone, some } from "runelib";
import * as ecc from "bells-secp256k1";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment variables validation
if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is required in .env file");
}

// Configuration from environment variables
const CONFIG = {
  network: process.env.NETWORK === "testnet" ? networks.testnet : networks.bellcoin,
  privateKey: process.env.PRIVATE_KEY,
  destinationAddress: process.env.DESTINATION_ADDRESS || "",
  mintCount: parseInt(process.env.MINT_COUNT || "200"),
  feeRate: parseInt(process.env.FEE_RATE || "50"),
  rune: {
    id: parseInt(process.env.RUNE_ID || "1"),
    symbol: parseInt(process.env.RUNE_SYMBOL || "0"),
    amount: parseInt(process.env.RUNE_AMOUNT || "1")
  },
  rpc: {
    useLocal: process.env.USE_LOCAL_RPC === "true",
    url: process.env.RPC_URL || "http://localhost:19918",
    username: process.env.RPC_USER || "test",
    password: process.env.RPC_PASS || "test"
  }
};

const ECPair = ECPairFactory(ecc);

const API_URLS = {
  testnet: "https://testnet.nintondo.io/electrs",
  mainnet: "https://api.nintondo.io/api",
};

async function callRPC(method: string, params: any[]) {
  const response = await fetch(CONFIG.rpc.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${CONFIG.rpc.username}:${CONFIG.rpc.password}`).toString('base64')
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

async function mint() {
  const mintstone = new Runestone(
    [], 
    none(), 
    some(new RuneId(CONFIG.rune.id, CONFIG.rune.symbol)), 
    some(CONFIG.rune.amount)
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
      .slice(0, CONFIG.mintCount)
      .toSorted((a, b) => b.value - a.value)
  );

  if (!utxos) {
    throw new Error("No UTXOs found");
  }

  if (utxos.length < CONFIG.mintCount) {
    const available = utxos
      .slice(0, 300)
      .reduce((prev, cur) => cur.value + prev, 0);

    if (available < minRequired * CONFIG.mintCount) {
      throw new Error(
        "Insufficient funds or you need to consolidate UTXOs first"
      );
    }

    const fee = calculateFee(utxos.length, CONFIG.mintCount, CONFIG.feeRate);
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

    let value = Math.floor((available - fee) / CONFIG.mintCount);

    for (let i = 0; i < CONFIG.mintCount; i++) {
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

export function calculateFee(
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

export interface Utxo {
  txid: string;
  vout: number;
  value: number;
  hex: string;
}

export const getUtxos = async (
  address: string,
  opts?: {
    amount?: number;
    disableHex?: boolean;
  }
): Promise<Utxo[] | undefined> => {
  try {
    if (CONFIG.rpc.useLocal) {
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
    console.error('Error fetching UTXOs:', error);
    return undefined;
  }
};

const checkedPushTx = async (txHex: string) => {
  try {
    if (CONFIG.rpc.useLocal) {
      const txid = await callRPC("sendrawtransaction", [txHex]);
      console.log(`Successfully pushed transaction ${txid}`);
      return txid;
    } else {
      const res = await fetch(
        API_URLS[CONFIG.network === networks.bellcoin ? "mainnet" : "testnet"] + `/tx`,
        {
          method: "POST",
          body: txHex,
        }
      );

      if (res.ok) {
        const txid = await res.text();
        console.log(`Successfully pushed transaction ${txid}`);
        return txid;
      } else {
        const message = await res.text();
        if (message.includes("scriptsig-size")) {
          throw new Error(txHex);
        }
        if (
          message.includes("Transaction already in block chain") ||
          message.includes("bad-txns-inputs-missingorspent")
        ) {
          return true;
        }
        console.error(message);
      }
    }
  } catch (error) {
    console.error('Error sending transaction:', error);
    return undefined;
  }
};

console.log("Starting rune minting...");
console.log(`Network: ${CONFIG.network === networks.testnet ? "testnet" : "mainnet"}`);
console.log(`Using ${CONFIG.rpc.useLocal ? "local RPC" : "remote API"}`);
console.log(`Minting ${CONFIG.mintCount} transactions of ${CONFIG.rune.amount} runes each`);
console.log(`Total runes to mint: ${CONFIG.mintCount * CONFIG.rune.amount}`);

while (true) {
  const toPush = await mint();

  while (toPush.length > 0) {
    const res = await checkedPushTx(toPush[0]);

    if (typeof res === "boolean" && res === true) {
      toPush.shift();
    } else if (typeof res === "undefined") {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    } else {
      toPush.shift();
    }
  }
}
