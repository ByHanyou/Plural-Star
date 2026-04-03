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
  }

  var systemName: String
}
#endif
