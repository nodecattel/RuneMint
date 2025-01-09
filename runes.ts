import { networks, payments, Psbt, address as baddr } from "belcoinjs-lib";
import ECPairFactory from "belpair";
import { none, RuneId, Runestone, some } from "runelib";
import * as ecc from "bells-secp256k1";

const NETWORK = networks.bellcoin;
const PRIVATE_KEY = "";
const FEE_RATE = 2;
const MINT_COUNT = 200; // MAX 1000

const ECPair = ECPairFactory(ecc);
const API_URLS = {
  testnet: "https://testnet.nintondo.io/electrs",
  mainnet: "https://api.nintondo.io/api",
};

async function mint() {
  const mintstone = new Runestone([], none(), some(new RuneId(1, 0)), some(1));

  const keyPair = ECPair.fromWIF(PRIVATE_KEY, networks.bellcoin);

  const { address } = payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network: NETWORK,
  });

  const minRequired = calculateFee(1, 2, FEE_RATE);

  let utxos = await getUtxos(address as string).then((utxos) =>
    utxos
      ?.filter((utxo) => utxo.value >= minRequired + 1000)
      .slice(0, MINT_COUNT)
      .toSorted((a, b) => b.value - a.value)
  );

  if (!utxos) {
    throw new Error("No UTXOs found");
  }

  if (utxos.length < MINT_COUNT) {
    const available = utxos
      .slice(0, 300)
      .reduce((prev, cur) => cur.value + prev, 0);

    if (available < minRequired * MINT_COUNT) {
      throw new Error(
        "Insufficient funds or you need to consolidate UTXOs first"
      );
    }

    const fee = calculateFee(utxos.length, MINT_COUNT, FEE_RATE);

    const psbt = new Psbt({ network: NETWORK });

    utxos.slice(0, 300).forEach((utxo) => {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          value: utxo.value,
          script: baddr.toOutputScript(address as string, NETWORK),
        },
      });
    });

    let value = Math.floor((available - fee) / MINT_COUNT);

    for (let i = 0; i < MINT_COUNT; i++) {
      psbt.addOutput({
        script: baddr.toOutputScript(address as string, NETWORK),
        value,
      });
    }

    psbt.signAllInputs(keyPair);
    psbt.finalizeAllInputs();

    return [psbt.extractTransaction().toHex()];
  }

  let txs = [];

  for (const utxo of utxos) {
    const mintPsbt = new Psbt({ network: NETWORK });

    mintPsbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: utxo.value,
        script: baddr.toOutputScript(address as string, NETWORK),
      },
    });

    mintPsbt.addOutput({
      script: mintstone.encipher(),
      value: 0,
    });

    mintPsbt.addOutput({
      address: address as string,
      value: utxo.value - minRequired,
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
  const params = new URLSearchParams();

  if (typeof opts?.amount === "number") {
    params.set("amount", opts?.amount.toString());
  }

  if (!opts?.disableHex) {
    params.set("hex", "true");
  }

  try {
    const res = await fetch(
      API_URLS[NETWORK === networks.testnet ? "testnet" : "mainnet"] +
        `/address/${address}/utxo?${params.toString()}`
    );
    return await res.json();
  } catch {
    return undefined;
  }
};

const checkedPushTx = async (txHex: string) => {
  const res = await fetch(
    API_URLS[NETWORK === networks.bellcoin ? "mainnet" : "testnet"] + `/tx`,
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
};

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
