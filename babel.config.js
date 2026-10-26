module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['transform-inline-environment-variables', {include: ['PS_RELAY_URL', 'PS_GATEWAY_URL', 'PS_LOG_LEVEL', 'PS_VERBOSE_NETWORK', 'PS_STARTUP_TRACE', 'PS_STORAGE_TRACE']}],
    'react-native-worklets/plugin',
  ],
};
