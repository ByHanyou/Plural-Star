import {useState} from 'react';
import {NetworkManager, NetworkState} from './NetworkManager';
import {useWhileTabActive} from '../hooks/useTabActive';

export const useNetwork = (): NetworkState => {
  const [state, setState] = useState<NetworkState>(() => NetworkManager.getState());
  useWhileTabActive(() => NetworkManager.subscribe(setState));
  return state;
};
