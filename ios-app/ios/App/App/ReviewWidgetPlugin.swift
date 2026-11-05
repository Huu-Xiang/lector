import Foundation
import Capacitor
import WidgetKit

/// Stores the review counts the page sends and asks the home screen widget to redraw.
@objc(ReviewWidgetPlugin)
public class ReviewWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReviewWidgetPlugin"
    public let jsName = "ReviewWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
    ]

    @objc func update(_ call: CAPPluginCall) {
        if call.getBool("clear") == true {
            ReviewWidgetSnapshot.save(nil)
        } else {
            let nextDue = call.getString("nextDue").flatMap(Self.parseDate)
            ReviewWidgetSnapshot.save(ReviewWidgetSnapshot(
                dueNow: call.getInt("dueNow") ?? 0,
                newAvailable: call.getInt("newAvailable") ?? 0,
                nextDue: nextDue,
                updatedAt: Date()
            ))
        }
        WidgetCenter.shared.reloadTimelines(ofKind: ReviewWidgetSnapshot.widgetKind)
        call.resolve()
    }

    /// The API sends ISO 8601 with or without fractional seconds.
    private static func parseDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}
