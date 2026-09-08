import { NetworkDef } from './types';

const DEFAULT_RELAY_URL = 'http://pluralstar.dedyn.io:7523';
const DEFAULT_RELAY_TOKEN = '';

export const DEFAULT_GATEWAY_URL = 'http://pluralstar.dedyn.io:7524';

const DEFAULT_NETWORK: NetworkDef = {
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
