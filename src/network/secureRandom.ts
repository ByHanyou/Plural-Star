// Wire tweetnacl's PRNG to a real CSPRNG on React Native.
//
// Two facts make this necessary:
//   1. Hermes has no crypto.getRandomValues; react-native-get-random-values
//      polyfills it onto the global object.
//   2. tweetnacl's own PRNG auto-detection checks `self.crypto`, which React
//      Native does not define, so it would otherwise fall back to a Node
//      `require('crypto')` that fails — leaving nacl with "no PRNG" and crashing
//      key generation on-device.
//
// Importing this module (before any nacl key/box use) installs the polyfill and
// points nacl at it explicitly. identity.ts and crypto.ts import it first.

import 'react-native-get-random-values';
import nacl from 'tweetnacl';

const g: any = globalThis as any;

if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
  nacl.setPRNG((x: Uint8Array, n: number) => {
    const tmp = new Uint8Array(n);
    g.crypto.getRandomValues(tmp);
    for (let i = 0; i < n; i++) x[i] = tmp[i];
    for (let i = 0; i < n; i++) tmp[i] = 0; // best-effort wipe
  });
}

export {};
