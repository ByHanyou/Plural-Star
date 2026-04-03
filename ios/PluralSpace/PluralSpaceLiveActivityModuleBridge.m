#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PluralSpaceLiveActivity, NSObject)

RCT_EXTERN_METHOD(startOrUpdate:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivity:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
