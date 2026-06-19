import { createHash } from "crypto";
import { HDNodeWallet, Mnemonic, keccak256 as ethersKeccak } from "ethers";
import type { Chain } from "@prisma/client";

/**
 * Deterministic per-merchant deposit addresses derived from a single master
 * mnemonic (WALLET_MNEMONIC), same discipline as Otuburu's HD wallet.
 *
 * EVM:  BIP44 path m/44'/60'/0'/0/<index>
 * TRON: BIP44 path m/44'/195'/0'/0/<index>, address is base58check of the
 *       keccak256(pubkey) tail with 0x41 prefix.
 *
 * The derivation index is stored on DepositAddress so we can always re-derive
 * (and, for sweeps, recover the key) from the seed alone.
 */

function mnemonic(): Mnemonic {
  const phrase = process.env.WALLET_MNEMONIC;
  if (!phrase) throw new Error("WALLET_MNEMONIC is not set");
  return Mnemonic.fromPhrase(phrase.trim());
}

export function deriveEvmAddress(index: number): string {
  const path = `m/44'/60'/0'/0/${index}`;
  const wallet = HDNodeWallet.fromMnemonic(mnemonic(), path);
  return wallet.address;
}

// --- TRON address encoding (base58check) ---

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(buffer: Uint8Array): string {
  let digits = [0];
  for (const byte of buffer) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (const byte of buffer) {
    if (byte === 0) out += ALPHABET[0];
    else break;
  }
  for (let k = digits.length - 1; k >= 0; k--) out += ALPHABET[digits[k]];
  return out;
}

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

export function deriveTronAddress(index: number): string {
  const path = `m/44'/195'/0'/0/${index}`;
  const wallet = HDNodeWallet.fromMnemonic(mnemonic(), path);
  // ethers gives us a 0x04-prefixed uncompressed key via signingKey.publicKey
  const pub = wallet.signingKey.publicKey; // 0x04 + X(32) + Y(32)
  const pubBytes = hexToBytes(pub.slice(2)).slice(1); // drop 0x04
  const hash = keccak256(pubBytes);
  const addr20 = hash.slice(-20);
  const tron = new Uint8Array(21);
  tron[0] = 0x41;
  tron.set(addr20, 1);
  const checksum = sha256(sha256(tron)).slice(0, 4);
  const full = new Uint8Array(25);
  full.set(tron);
  full.set(checksum, 21);
  return base58(full);
}

export async function deriveAddress(chain: Chain, index: number): Promise<string> {
  if (chain === "TRON") return deriveTronAddress(index);
  return deriveEvmAddress(index);
}

// --- helpers ---

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

// keccak256 over raw bytes (used for the TRON address derivation).
function keccak256(bytes: Uint8Array): Uint8Array {
  return hexToBytes(ethersKeccak(bytes));
}
