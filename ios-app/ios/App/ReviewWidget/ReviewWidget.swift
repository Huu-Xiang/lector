import SwiftUI
import WidgetKit

struct ReviewEntry: TimelineEntry {
    let date: Date
    /// nil when no snapshot exists yet: the user has not opened the signed-in app.
    let snapshot: ReviewWidgetSnapshot?
    /// True once `nextDue` has passed: cards are due, but the app has not counted them.
    let nextDueReached: Bool
}

struct ReviewProvider: TimelineProvider {
    func placeholder(in context: Context) -> ReviewEntry {
        ReviewEntry(
            date: Date(),
            snapshot: ReviewWidgetSnapshot(dueNow: 12, newAvailable: 5, nextDue: nil, updatedAt: Date()),
            nextDueReached: false
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (ReviewEntry) -> Void) {
        let now = Date()
        let entry = entries(from: now).first ?? ReviewEntry(date: now, snapshot: nil, nextDueReached: false)
        completion(context.isPreview ? placeholder(in: context) : entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ReviewEntry>) -> Void) {
        completion(Timeline(entries: entries(from: Date()), policy: .never))
    }

    /// Now, plus one entry at `nextDue` when nothing is due yet, so the widget turns over on time.
    private func entries(from now: Date) -> [ReviewEntry] {
        let snapshot = ReviewWidgetSnapshot.load()
        var result = [ReviewEntry(
            date: now,
            snapshot: snapshot,
            nextDueReached: snapshot.map { $0.dueNow == 0 && ($0.nextDue.map { $0 <= now } ?? false) } ?? false
        )]
        if let snapshot, snapshot.dueNow == 0, let next = snapshot.nextDue, next > now {
            result.append(ReviewEntry(date: next, snapshot: snapshot, nextDueReached: true))
        }
        return result
    }
}

struct ReviewWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.widgetRenderingMode) private var renderingMode
    @ScaledMetric(relativeTo: .largeTitle) private var dueCountSize: CGFloat = 44
    let entry: ReviewEntry

    private var sage: Color {
        colorScheme == .dark
            ? Color(red: 0x54 / 255, green: 0xab / 255, blue: 0x92 / 255)
            : Color(red: 0x2f / 255, green: 0x8a / 255, blue: 0x76 / 255)
    }

    private var background: Color {
        colorScheme == .dark
            ? Color(red: 0x21 / 255, green: 0x1d / 255, blue: 0x16 / 255)
            : Color(red: 0xff / 255, green: 0xfd / 255, blue: 0xf7 / 255)
    }

    var body: some View {
        content
            .widgetURL(URL(string: "readfox://practice"))
            .containerBackground(for: .widget) { background }
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .accessoryCircular: circular
        case .accessoryRectangular: rectangular
        case .systemMedium: medium
        default: small
        }
    }

    /// What the widget counts, with a small mark at the trailing corner; the HIG says a logo is
    /// seldom needed and the top-right corner is enough when one helps.
    private var header: some View {
        HStack {
            Text("widget.name").font(.caption).fontWeight(.semibold).foregroundStyle(.secondary)
            Spacer(minLength: 4)
            Image("Fox").resizable().frame(width: 16, height: 16).clipShape(.rect(cornerRadius: 4))
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder private var status: some View {
        if let snapshot = entry.snapshot {
            if snapshot.dueNow > 0 {
                VStack(alignment: .leading, spacing: 0) {
                    Text(snapshot.dueNow, format: .number)
                        .font(.system(size: dueCountSize, weight: .bold, design: .rounded))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                        .widgetAccentable()
                        .foregroundStyle(sage)
                        .contentTransition(.numericText())
                    Text("widget.due").font(.subheadline).foregroundStyle(.secondary)
                }
            } else if entry.nextDueReached {
                Label("widget.ready", systemImage: "rectangle.stack.fill")
                    .font(.headline).foregroundStyle(sage)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Label("widget.done", systemImage: "checkmark.circle.fill")
                        .font(.headline).foregroundStyle(sage)
                    if let next = snapshot.nextDue {
                        Text("widget.next \(next, style: .relative)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        } else {
            Text("widget.empty").font(.footnote).foregroundStyle(.secondary)
        }
    }

    private var small: some View {
        VStack(alignment: .leading) {
            header
            Spacer(minLength: 0)
            status
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var medium: some View {
        HStack(alignment: .bottom) {
            small
            if let snapshot = entry.snapshot {
                VStack(alignment: .trailing, spacing: 8) {
                    if snapshot.newAvailable > 0 {
                        Text("widget.new \(snapshot.newAvailable)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Text("widget.start")
                        .font(.subheadline).fontWeight(.semibold)
                        .foregroundStyle(renderingMode == .fullColor ? Color.white : Color.primary)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Capsule().fill(renderingMode == .fullColor ? sage : Color.primary.opacity(0.12)))
                        .widgetAccentable()
                }
            }
        }
    }

    @ViewBuilder private var circular: some View {
        let due = entry.snapshot?.dueNow ?? 0
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Image(systemName: due > 0 || entry.nextDueReached ? "rectangle.stack" : "checkmark")
                    .font(.caption)
                if due > 0 { Text(due, format: .number).font(.headline).widgetAccentable() }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("widget.name") + Text(": ") + circularAccessibilityLabel)
    }

    private var circularAccessibilityLabel: Text {
        if let snapshot = entry.snapshot, snapshot.dueNow > 0 {
            return Text("widget.dueCount \(snapshot.dueNow)")
        }
        if entry.snapshot == nil { return Text("widget.empty") }
        return entry.nextDueReached ? Text("widget.ready") : Text("widget.done")
    }

    private var rectangular: some View {
        VStack(alignment: .leading) {
            Text(verbatim: "Readfox").font(.headline)
            if let snapshot = entry.snapshot, snapshot.dueNow > 0 {
                Text("widget.dueCount \(snapshot.dueNow)")
            } else if entry.nextDueReached {
                Text("widget.ready")
            } else {
                Text("widget.done")
            }
        }
    }
}

struct ReviewWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: ReviewWidgetSnapshot.widgetKind, provider: ReviewProvider()) { entry in
            ReviewWidgetView(entry: entry)
        }
        .configurationDisplayName("widget.name")
        .description("widget.description")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

@main
struct ReviewWidgetBundle: WidgetBundle {
    var body: some Widget {
        ReviewWidget()
    }
}
