import { config } from '../config';
import { NetworkDef } from './types';

const DEFAULT_RELAY_URL = 'https://pluralstar.dedyn.io';
const DEFAULT_RELAY_TOKEN = '';

export const DEFAULT_GATEWAY_URL = DEFAULT_RELAY_URL;

export const secureServiceUrl = (value: string): string => {
  const url = value.trim().replace(/\/+$/, '');
  if (url === 'http://pluralstar.dedyn.io:7523' || url === 'http://pluralstar.dedyn.io:7524') {
    return DEFAULT_RELAY_URL;
  }
  if (/^https:\/\/[^/@?#\s\\]+(?:\/[^?#\s\\]*)?$/i.test(url)) return url;
  if (/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?(?:\/[^?#\s\\]*)?$/i.test(url)) return url;
  return '';
};

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
  const relayUrl = secureServiceUrl(override?.relayUrl || config().relayUrl || DEFAULT_NETWORK.relayUrl);
  const token = override?.token ?? DEFAULT_NETWORK.token;
  return { ...DEFAULT_NETWORK, relayUrl, token };
};
