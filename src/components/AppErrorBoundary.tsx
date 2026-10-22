import React from 'react';
import {View, TouchableOpacity} from 'react-native';
import {Text} from './AppText';
import i18n from '../i18n/i18n';
import {log} from '../utils/log';

export class AppErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  state: {error: Error | null} = {error: null};
  static getDerivedStateFromError(error: Error) {
    return {error};
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error('errorBoundary', 'caught:', error, info?.componentStack);
  }
  reset = () => this.setState({error: null});
  render() {
    if (!this.state.error) return this.props.children;
    const err = this.state.error;
    const msg = err.message || String(err);
    return (
      <View style={{flex: 1, backgroundColor: '#0a0a0a', padding: 24, justifyContent: 'center', alignItems: 'center'}}>
        <Text style={{color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12, textAlign: 'center'}} accessibilityRole="header">
          {i18n.t('errorBoundary.title')}
        </Text>
        <Text style={{color: '#bbb', fontSize: 13, marginBottom: 24, textAlign: 'center'}}>
          {i18n.t('errorBoundary.body')}
        </Text>
        <Text style={{color: '#666', fontSize: 11, marginBottom: 24, textAlign: 'center'}} numberOfLines={4}>
          {msg}
        </Text>
        <TouchableOpacity onPress={this.reset} accessibilityRole="button" hitSlop={{top: 6, bottom: 6}} style={{paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, backgroundColor: '#3a7bd5'}}>
          <Text style={{color: '#fff', fontSize: 14, fontWeight: '600'}}>
            {i18n.t('errorBoundary.retry')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
}
