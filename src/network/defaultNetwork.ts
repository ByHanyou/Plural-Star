import { NetworkDef } from './types';

export const DEFAULT_RELAY_URL = 'http://pluralstar.dedyn.io:7523';
export const DEFAULT_RELAY_TOKEN = '';

export const DEFAULT_GATEWAY_URL = 'http://pluralstar.dedyn.io:7524';

export const DEFAULT_NETWORK: NetworkDef = {
  id: 'plural-star-global',
  name: 'Plural Star Global',
  relayUrl: DEFAULT_RELAY_URL,
  token: DEFAULT_RELAY_TOKEN,
  isDefault: true,
};

export const resolveNetwork = (
  override?: { relayUrl?: string; token?: string },
): NetworkDef => {
  const relayUrl = (override?.relayUrl || DEFAULT_NETWORK.relayUrl || '').replace(/\/+$/, '');
  const token = override?.token ?? DEFAULT_NETWORK.token;
  return { ...DEFAULT_NETWORK, relayUrl, token };
};
