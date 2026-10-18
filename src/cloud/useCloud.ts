import {useState} from 'react';
import {CloudServices} from './cloudPlatform';
import {CloudStatus} from './cloudTypes';
import {useWhileTabActive} from '../hooks/useTabActive';

export const useCloud = (): CloudStatus => {
  const [state, setState] = useState<CloudStatus>(() => CloudServices.status());
  useWhileTabActive(() => CloudServices.subscribe(setState));
  return state;
};
