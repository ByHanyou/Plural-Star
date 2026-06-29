// React hook mirroring NetworkManager state. Components re-render on any network
// state change (status, friends, presence). Call NetworkManager.init() once at
// app startup; this hook only subscribes.

import { useEffect, useState } from 'react';
import { NetworkManager, NetworkState, IncomingDM } from './NetworkManager';

export const useNetwork = (): NetworkState => {
  const [state, setState] = useState<NetworkState>(() => NetworkManager.getState());
  useEffect(() => NetworkManager.subscribe(setState), []);
  return state;
};

// Subscribe to incoming direct messages (foundation: surfaced to the caller;
// a full chat UI can build on this later).
export const useIncomingDM = (handler: (dm: IncomingDM) => void): void => {
  useEffect(() => NetworkManager.onDM(handler), [handler]);
};
