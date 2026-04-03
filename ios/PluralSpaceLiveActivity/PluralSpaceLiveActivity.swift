import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.1, *)
struct PluralSpaceLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PluralSpaceActivityAttributes.self) { context in
      LockScreenView(context: context)
        .activityBackgroundTint(Color.black.opacity(0.92))
        .activitySystemActionForegroundColor(Color(hex: "#DAA520"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label("Front", systemImage: "person.2.fill")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color(hex: "#DAA520"))
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.state.startTime, style: .timer)
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 4) {
            Text(context.attributes.systemName)
              .font(.caption2.weight(.semibold))
              .foregroundStyle(.secondary)
            Text(context.state.primaryText)
              .font(.headline)
              .lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            if let coFrontText = context.state.coFrontText, !coFrontText.isEmpty {
              detailRow(label: "Co-Front", value: coFrontText)
            }
            if let coConsciousText = context.state.coConsciousText, !coConsciousText.isEmpty {
              detailRow(label: "Co-Conscious", value: coConsciousText)
            }
            if let mood = context.state.mood, !mood.isEmpty {
              detailRow(label: "Mood", value: mood)
            }
            if let location = context.state.location, !location.isEmpty {
              detailRow(label: "At", value: location)
            }
          }
        }
      } compactLeading: {
        Image(systemName: "person.2.fill")
          .foregroundStyle(Color(hex: "#DAA520"))
      } compactTrailing: {
        Text(context.state.startTime, style: .timer)
          .font(.caption2.monospacedDigit())
      } minimal: {
        Image(systemName: "person.2.fill")
          .foregroundStyle(Color(hex: "#DAA520"))
      }
      .keylineTint(Color(hex: "#DAA520"))
    }
  }

  @ViewBuilder
  private func detailRow(label: String, value: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(label.uppercased())
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)
      Text(value)
        .font(.caption)
        .lineLimit(1)
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
          .foregroundStyle(Color(hex: "#DAA520"))
      }

      if let coFrontText = context.state.coFrontText, !coFrontText.isEmpty {
        labeledLine("Co-Front", coFrontText)
      }
      if let coConsciousText = context.state.coConsciousText, !coConsciousText.isEmpty {
        labeledLine("Co-Conscious", coConsciousText)
      }

      HStack(spacing: 12) {
        if let mood = context.state.mood, !mood.isEmpty {
          chip(label: "Mood", value: mood)
        }
        if let location = context.state.location, !location.isEmpty {
          chip(label: "At", value: location)
        }
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

  @ViewBuilder
  private func labeledLine(_ label: String, _ value: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(label.uppercased())
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)
      Text(value)
        .font(.caption)
        .lineLimit(1)
    }
  }

  @ViewBuilder
  private func chip(label: String, value: String) -> some View {
    HStack(spacing: 6) {
      Text(label)
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)
      Text(value)
        .font(.caption)
        .lineLimit(1)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(Color.white.opacity(0.08), in: Capsule())
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
