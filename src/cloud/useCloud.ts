import {useEffect, useState} from 'react';
import {CloudServices} from './cloudPlatform';
import {CloudStatus} from './cloudTypes';

export const useCloud = (): CloudStatus => {
  const [state, setState] = useState<CloudStatus>(() => CloudServices.status());
  useEffect(() => CloudServices.subscribe(setState), []);
  return state;
};
