import 'react-native-get-random-values';
import nacl from 'tweetnacl';

const g: any = globalThis as any;

if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
  nacl.setPRNG((x: Uint8Array, n: number) => {
    const tmp = new Uint8Array(n);
    g.crypto.getRandomValues(tmp);
    for (let i = 0; i < n; i++) x[i] = tmp[i];
    for (let i = 0; i < n; i++) tmp[i] = 0;
  });
}

export {};
