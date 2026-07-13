import React from 'react';
import {View, TouchableOpacity} from 'react-native';
import {Text} from './AppText';
import i18n from '../i18n/i18n';

export class AppErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) {
    return {error};
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('AppErrorBoundary caught:', error, info?.componentStack);
    }
  }
  reset = () => this.setState({error: null});
  render() {
    if (!this.state.error) return this.props.children;
    const err = this.state.error as Error;
    const msg = err?.message || String(err);
    return (
      <View style={{flex: 1, backgroundColor: '#0a0a0a', padding: 24, justifyContent: 'center', alignItems: 'center'}}>
        <Text style={{color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12, textAlign: 'center'}}>
          {i18n.t('errorBoundary.title')}
        </Text>
        <Text style={{color: '#bbb', fontSize: 13, marginBottom: 24, textAlign: 'center'}}>
          {i18n.t('errorBoundary.body')}
        </Text>
        <Text style={{color: '#666', fontSize: 11, marginBottom: 24, textAlign: 'center'}} numberOfLines={4}>
          {msg}
        </Text>
        <TouchableOpacity onPress={this.reset} accessibilityRole="button" style={{paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, backgroundColor: '#3a7bd5'}}>
          <Text style={{color: '#fff', fontSize: 14, fontWeight: '600'}}>
            {i18n.t('errorBoundary.retry')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
}
