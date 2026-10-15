import {useEffect, useState} from 'react';
import {NetworkManager, NetworkState} from './NetworkManager';

export const useNetwork = (): NetworkState => {
  const [state, setState] = useState<NetworkState>(() => NetworkManager.getState());
  useEffect(() => NetworkManager.subscribe(setState), []);
  return state;
};
