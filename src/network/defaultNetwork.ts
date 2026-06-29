// The default ("global") public network the app joins when networking is enabled.
//
// A mobile client has no libp2p node of its own, so "joining the network" means
// connecting to a reachable Plural Star Node's API. Until a hosted public relay
// endpoint is finalized (the node's DefaultBootstrapPeers / DefaultDirectoryURL
// are still placeholders), this points at a relay you control. Override it at
// runtime via Network settings (relayUrl/token) without shipping a new build.
//
// NOTE FOR DEPLOY: set DEFAULT_RELAY_URL to the public node endpoint (e.g.
// https://relay.pluralstar.app or http://<public-ip>:7523) and DEFAULT_RELAY_TOKEN
// to the token that node accepts for app clients (or '' if it runs open for
// app connections). For LAN testing against your own node, set api_host: 0.0.0.0
// in the node config and use http://<lan-ip>:7523 here or in settings.

import { NetworkDef } from './types';

// The public default relay (open mode — no token). The toggle connects here
// automatically; users never enter an address. Requires TCP 7523 reachable on
// the node host (port-forwarded just like the libp2p port).
export const DEFAULT_RELAY_URL = 'http://pluralstar.dedyn.io:7523';
export const DEFAULT_RELAY_TOKEN = ''; // open mode

export const DEFAULT_NETWORK: NetworkDef = {
  id: 'plural-star-global',
  name: 'Plural Star Global',
  relayUrl: DEFAULT_RELAY_URL,
  token: DEFAULT_RELAY_TOKEN,
  isDefault: true,
};

// Resolve the network to join, applying any user override from settings.
export const resolveNetwork = (
  override?: { relayUrl?: string; token?: string },
): NetworkDef => {
  const relayUrl = (override?.relayUrl || DEFAULT_NETWORK.relayUrl || '').replace(/\/+$/, '');
  const token = override?.token ?? DEFAULT_NETWORK.token;
  return { ...DEFAULT_NETWORK, relayUrl, token };
};
