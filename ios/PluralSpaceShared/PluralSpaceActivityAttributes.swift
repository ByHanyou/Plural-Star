import Foundation

#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
struct PluralSpaceActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var primaryText: String
    var coFrontText: String?
    var coConsciousText: String?
    var mood: String?
    var location: String?
    var note: String?
    var startTime: Date
    var statusLine: String
    var friendsText: String?
    var frontLabel: String?
    var coFrontLabel: String?
    var coConsciousLabel: String?
    var moodLabel: String?
    var locationLabel: String?
    var friendsLabel: String?
  }

  var systemName: String
}

@available(iOS 16.1, *)
struct PluralStarFriendsActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var lines: String
  }

  var title: String?
}
#endif
