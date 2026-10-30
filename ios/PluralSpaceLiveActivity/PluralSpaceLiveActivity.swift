import ActivityKit
import SwiftUI
import WidgetKit

private let accent = Color(hex: "#DAA520")

private func caption(_ text: String) -> some View {
  Text(text)
    .font(.caption2.weight(.semibold))
    .foregroundStyle(.secondary)
}

private func icon(_ systemName: String) -> some View {
  Image(systemName: systemName)
    .foregroundStyle(accent)
}

@ViewBuilder
private func labeledLine(_ label: String, _ value: String?) -> some View {
  if let value, !value.isEmpty {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      caption(label.uppercased())
      Text(value)
        .font(.caption)
        .lineLimit(1)
    }
  }
}

@ViewBuilder
private func chip(_ label: String, _ value: String?) -> some View {
  if let value, !value.isEmpty {
    HStack(spacing: 6) {
      caption(label)
      Text(value)
        .font(.caption)
        .lineLimit(1)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(Color.white.opacity(0.08), in: Capsule())
  }
}

@available(iOS 16.1, *)
private extension View {
  func activityChrome() -> some View {
    activityBackgroundTint(Color.black.opacity(0.92))
      .activitySystemActionForegroundColor(accent)
  }
}

@available(iOS 16.1, *)
private extension PluralSpaceActivityAttributes.ContentState {
  var frontTitle: String { frontLabel ?? "Front" }
  var coFrontTitle: String { coFrontLabel ?? "Co-Front" }
  var coConsciousTitle: String { coConsciousLabel ?? "Co-Conscious" }
  var moodTitle: String { moodLabel ?? "Mood" }
  var locationTitle: String { locationLabel ?? "At" }
}

@available(iOS 16.1, *)
private extension PluralStarFriendsActivityAttributes {
  var heading: String { title ?? "Friends" }
}

@available(iOS 16.1, *)
struct PluralSpaceLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PluralSpaceActivityAttributes.self) { context in
      LockScreenView(context: context)
        .activityChrome()
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label(context.state.frontTitle, systemImage: "person.2.fill")
            .font(.caption.weight(.semibold))
            .foregroundStyle(accent)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.state.startTime, style: .timer)
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 4) {
            caption(context.attributes.systemName)
            Text(context.state.primaryText)
              .font(.headline)
              .lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            labeledLine(context.state.coFrontTitle, context.state.coFrontText)
            labeledLine(context.state.coConsciousTitle, context.state.coConsciousText)
            labeledLine(context.state.moodTitle, context.state.mood)
            labeledLine(context.state.locationTitle, context.state.location)
          }
        }
      } compactLeading: {
        icon("person.2.fill")
      } compactTrailing: {
        Text(context.state.startTime, style: .timer)
          .font(.caption2.monospacedDigit())
      } minimal: {
        icon("person.2.fill")
      }
      .keylineTint(accent)
    }
  }
}

@available(iOS 16.1, *)
private struct LockScreenView: View {
  let context: ActivityViewContext<PluralSpaceActivityAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 2) {
          Text(context.attributes.systemName)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
          Text(context.state.primaryText)
            .font(.headline)
            .lineLimit(1)
        }
        Spacer()
        Text(context.state.startTime, style: .timer)
          .font(.subheadline.monospacedDigit())
          .foregroundStyle(accent)
      }

      labeledLine(context.state.coFrontTitle, context.state.coFrontText)
      labeledLine(context.state.coConsciousTitle, context.state.coConsciousText)

      HStack(spacing: 12) {
        chip(context.state.moodTitle, context.state.mood)
        chip(context.state.locationTitle, context.state.location)
      }

      if let note = context.state.note, !note.isEmpty {
        Text(note)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
  }
}

@available(iOS 16.1, *)
struct PluralStarFriendsActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PluralStarFriendsActivityAttributes.self) { context in
      VStack(alignment: .leading, spacing: 6) {
        caption(context.attributes.heading.uppercased())
        Text(context.state.lines)
          .font(.caption)
          .lineLimit(6)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
      .activityChrome()
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label(context.attributes.heading, systemImage: "person.2.wave.2.fill")
            .font(.caption.weight(.semibold))
            .foregroundStyle(accent)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(context.state.lines)
            .font(.caption)
            .lineLimit(6)
        }
      } compactLeading: {
        icon("person.2.wave.2.fill")
      } compactTrailing: {
        EmptyView()
      } minimal: {
        icon("person.2.wave.2.fill")
      }
      .keylineTint(accent)
    }
  }
}

private extension Color {
  init(hex: String) {
    let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var int: UInt64 = 0
    Scanner(string: cleaned).scanHexInt64(&int)
    let r = Double((int >> 16) & 0xFF) / 255
    let g = Double((int >> 8) & 0xFF) / 255
    let b = Double(int & 0xFF) / 255
    self.init(red: r, green: g, blue: b)
  }
}
