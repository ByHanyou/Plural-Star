import Foundation
import React
import UIKit

#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(PluralSpaceLiveActivity)
class PluralSpaceLiveActivity: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(startOrUpdate:resolver:rejecter:)
  func startOrUpdate(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
#if canImport(ActivityKit)
    guard #available(iOS 16.1, *) else {
      resolve(["available": false])
      return
    }

    guard let contentState = contentState(from: payload),
          let systemName = payload["systemName"] as? String else {
      reject("invalid_payload", "PluralSpaceLiveActivity received an invalid payload.", nil)
      return
    }

    Task {
      do {
        if let existing = Activity<PluralSpaceActivityAttributes>.activities.first {
          if #available(iOS 16.2, *) {
            await existing.update(
              ActivityContent(state: contentState, staleDate: nil)
            )
          } else {
            await existing.update(using: contentState)
          }
          resolve(["available": true, "id": existing.id, "action": "updated"])
          return
        }

        let attributes = PluralSpaceActivityAttributes(systemName: systemName)
        let activity: Activity<PluralSpaceActivityAttributes>
        if #available(iOS 16.2, *) {
          activity = try Activity.request(
            attributes: attributes,
            content: ActivityContent(state: contentState, staleDate: nil),
            pushType: nil
          )
        } else {
          activity = try Activity.request(
            attributes: attributes,
            contentState: contentState,
            pushType: nil
          )
        }
        resolve(["available": true, "id": activity.id, "action": "started"])
      } catch {
        reject("activity_error", error.localizedDescription, error)
      }
    }
#else
    resolve(["available": false])
#endif
  }

  @objc(endActivity:rejecter:)
  func endActivity(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
#if canImport(ActivityKit)
    guard #available(iOS 16.1, *) else {
      resolve(["available": false])
      return
    }

    Task {
      for activity in Activity<PluralSpaceActivityAttributes>.activities {
        if #available(iOS 16.2, *) {
          await activity.end(nil, dismissalPolicy: .immediate)
        } else {
          await activity.end(using: activity.contentState, dismissalPolicy: .immediate)
        }
      }
      resolve(["available": true])
    }
#else
    resolve(["available": false])
#endif
  }

#if canImport(ActivityKit)
  @available(iOS 16.1, *)
  private func contentState(from payload: NSDictionary) -> PluralSpaceActivityAttributes.ContentState? {
    guard let primaryText = payload["primaryText"] as? String,
          let statusLine = payload["statusLine"] as? String,
          let startTimeSeconds = payload["startTime"] as? Double else {
      return nil
    }

    return PluralSpaceActivityAttributes.ContentState(
      primaryText: primaryText,
      coFrontText: payload["coFrontText"] as? String,
      coConsciousText: payload["coConsciousText"] as? String,
      mood: payload["mood"] as? String,
      location: payload["location"] as? String,
      note: payload["note"] as? String,
      startTime: Date(timeIntervalSince1970: startTimeSeconds / 1000),
      statusLine: statusLine,
      friendsText: payload["friendsText"] as? String
    )
  }
#endif

  @objc(getFriendsPushToken:rejecter:)
  func getFriendsPushToken(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
#if canImport(ActivityKit)
    guard #available(iOS 16.2, *) else {
      resolve(NSNull())
      return
    }
    Task {
      var activity = Activity<PluralStarFriendsActivityAttributes>.activities.first
      if activity == nil {
        do {
          activity = try Activity.request(
            attributes: PluralStarFriendsActivityAttributes(),
            content: ActivityContent(
              state: PluralStarFriendsActivityAttributes.ContentState(lines: " "),
              staleDate: nil
            ),
            pushType: .token
          )
        } catch {
          resolve(NSNull())
          return
        }
      }
      guard let act = activity else {
        resolve(NSNull())
        return
      }
      if let token = act.pushToken {
        resolve(token.map { String(format: "%02x", $0) }.joined())
        return
      }
      let hex = await withTaskGroup(of: String?.self) { group -> String? in
        group.addTask {
          for await data in act.pushTokenUpdates {
            return data.map { String(format: "%02x", $0) }.joined()
          }
          return nil
        }
        group.addTask {
          try? await Task.sleep(nanoseconds: 5_000_000_000)
          return nil
        }
        let first = await group.next() ?? nil
        group.cancelAll()
        return first
      }
      if let hex {
        resolve(hex)
      } else {
        resolve(NSNull())
      }
    }
#else
    resolve(NSNull())
#endif
  }

  @objc(waitForProtectedData:rejecter:)
  func waitForProtectedData(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      if UIApplication.shared.isProtectedDataAvailable {
        resolve(true)
        return
      }
      var resolved = false
      var observer: NSObjectProtocol?
      var timeoutWork: DispatchWorkItem?
      let finish: (Bool) -> Void = { ok in
        if resolved { return }
        resolved = true
        if let obs = observer {
          NotificationCenter.default.removeObserver(obs)
          observer = nil
        }
        timeoutWork?.cancel()
        resolve(ok)
      }
      observer = NotificationCenter.default.addObserver(
        forName: UIApplication.protectedDataDidBecomeAvailableNotification,
        object: nil,
        queue: .main
      ) { _ in finish(true) }
      let work = DispatchWorkItem { finish(false) }
      timeoutWork = work
      DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: work)
    }
  }

  @objc(endFriendsActivity:rejecter:)
  func endFriendsActivity(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
#if canImport(ActivityKit)
    guard #available(iOS 16.2, *) else {
      resolve(NSNull())
      return
    }
    Task {
      for activity in Activity<PluralStarFriendsActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      resolve(true)
    }
#else
    resolve(NSNull())
#endif
  }
}
