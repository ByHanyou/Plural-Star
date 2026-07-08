import { useEffect, useState } from 'react';
import { NetworkManager, NetworkState, IncomingDM } from './NetworkManager';

export const useNetwork = (): NetworkState => {
  const [state, setState] = useState<NetworkState>(() => NetworkManager.getState());
  useEffect(() => NetworkManager.subscribe(setState), []);
  return state;
};

export const useIncomingDM = (handler: (dm: IncomingDM) => void): void => {
  useEffect(() => NetworkManager.onDM(handler), [handler]);
};
