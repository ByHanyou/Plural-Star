import type {TextScale} from './model/types';

export const TEXT_SCALE_OPTIONS: {labelKey: string; value: TextScale}[] = [
  {labelKey: 'modal.textScaleNormal', value: 1.0},
  {labelKey: 'modal.textScaleLarge', value: 1.25},
  {labelKey: 'modal.textScaleExtraLarge', value: 1.5},
];

export const CREDITS: {name: string; roleKey: string; url: string}[] = [
  {name: 'The Loud House System', roleKey: 'hub.creditLogo', url: 'https://x.com/theloudhousesys?s=21'},
  {name: 'sparklecatdev', roleKey: 'hub.creditIos', url: 'https://github.com/sparklecatdev'},
];

export const DISCORD_URL = 'https://discord.gg/FFQw33cu8m';
export const SUPPORT_URL = 'https://www.buymeacoffee.com/PluralStar';
