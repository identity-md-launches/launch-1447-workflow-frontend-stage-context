import nacl from "tweetnacl";
import { hexToBytes, bytesToHex, type Hex } from "viem";
export const KEY_MESSAGE =
  "DEAD DROP: open my drop. This signature is the key to my inbox. Sign it only on the DEAD DROP site";
export const MAX_SEALED_BYTES = 1024;
export const BOX_OVERHEAD = 1 + nacl.box.nonceLength + nacl.box.overheadLength;
export const MAX_TEXT_BYTES = MAX_SEALED_BYTES - BOX_OVERHEAD;
export type SessionKey = nacl.BoxKeyPair;
export const textBytes = (text: string) =>
  new TextEncoder().encode(text).length;
export const sealedBytes = (text: string) => textBytes(text) + BOX_OVERHEAD;
export async function deriveKey(signature: Hex): Promise<SessionKey> {
  const bytes = hexToBytes(signature);
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  bytes.fill(0);
  return nacl.box.keyPair.fromSecretKey(new Uint8Array(digest));
}
export function seal(text: string, peer: Hex, key: SessionKey): Hex {
  if (textBytes(text) === 0 || sealedBytes(text) > MAX_SEALED_BYTES)
    throw new Error(
      `Write 1–${MAX_TEXT_BYTES} UTF-8 bytes. Sealing adds ${BOX_OVERHEAD} bytes.`,
    );
  const peerBytes = hexToBytes(peer);
  if (
    peerBytes.length !== 32 ||
    nacl.scalarMult(key.secretKey, peerBytes).every((b) => b === 0)
  )
    throw new Error(
      "This wallet has an invalid encryption key. Ask them to open a valid drop.",
    );
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const cipher = nacl.box(
    new TextEncoder().encode(text),
    nonce,
    peerBytes,
    key.secretKey,
  );
  return bytesToHex(new Uint8Array([1, ...nonce, ...cipher]));
}
export function unseal(payload: Hex, peer: Hex, key: SessionKey): string {
  const bytes = hexToBytes(payload);
  if (
    bytes[0] !== 1 ||
    bytes.length < BOX_OVERHEAD + 1 ||
    bytes.length > MAX_SEALED_BYTES
  )
    throw new Error("Unsupported or invalid sealed note.");
  const plain = nacl.box.open(
    bytes.slice(25),
    bytes.slice(1, 25),
    hexToBytes(peer),
    key.secretKey,
  );
  if (!plain)
    throw new Error(
      "Cannot decrypt with this session key. A wallet may have changed its signing key, or this message is invalid.",
    );
  return new TextDecoder("utf-8", { fatal: true }).decode(plain);
}
export function destroyKey(key: SessionKey | undefined) {
  key?.secretKey.fill(0);
  key?.publicKey.fill(0);
}
