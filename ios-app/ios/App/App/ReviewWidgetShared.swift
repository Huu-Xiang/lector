import Foundation

/// The review counts the app writes and the widget reads. Compiled into both targets.
struct ReviewWidgetSnapshot: Codable {
    var dueNow: Int
    var newAvailable: Int
    var nextDue: Date?
    var updatedAt: Date

    /// Both targets need this App Group in their entitlements.
    static let appGroup = "group.app.readfox.ios"
    static let key = "reviewWidget.snapshot"
    static let widgetKind = "ReviewWidget"

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static func load() -> ReviewWidgetSnapshot? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(ReviewWidgetSnapshot.self, from: data)
    }

    static func save(_ snapshot: ReviewWidgetSnapshot?) {
        guard let defaults else { return }
        if let snapshot, let data = try? JSONEncoder().encode(snapshot) {
            defaults.set(data, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }
}
