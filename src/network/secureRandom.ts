import 'react-native-get-random-values';
import nacl from 'tweetnacl';

const g = globalThis as {crypto?: {getRandomValues?: (array: Uint8Array) => Uint8Array}};
const webCrypto = g.crypto;
const getRandomValues = webCrypto?.getRandomValues;

if (webCrypto && typeof getRandomValues === 'function') {
  nacl.setPRNG((x: Uint8Array, n: number) => {
    const tmp = new Uint8Array(n);
    getRandomValues.call(webCrypto, tmp);
    for (let i = 0; i < n; i++) x[i] = tmp[i];
    for (let i = 0; i < n; i++) tmp[i] = 0;
  });
}

export {};
