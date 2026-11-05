import UIKit
import Capacitor

/// A UITabBar over the bottom of the web view. The page sends the tabs and the selection;
/// a tap comes back as `tabSelected` with the tab id. Built with the iOS 26 SDK it gets Liquid Glass.
@objc(NativeTabBarPlugin)
public class NativeTabBarPlugin: CAPPlugin, CAPBridgedPlugin, UITabBarDelegate {
    public let identifier = "NativeTabBarPlugin"
    public let jsName = "NativeTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "select", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise),
    ]

    private var tabBar: UITabBar?
    private var ids: [String] = []
    /// What the page asked for; the keyboard hides the bar on top of that.
    private var wanted = true
    private var keyboardUp = false
    private var visible = true
    private let feedback = UISelectionFeedbackGenerator()

    /// Matches `--primary` in globals.css, light and dark.
    private static let sage = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0x54 / 255, green: 0xab / 255, blue: 0x92 / 255, alpha: 1)
            : UIColor(red: 0x2f / 255, green: 0x8a / 255, blue: 0x76 / 255, alpha: 1)
    }

    override public func load() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(keyboardWillShow), name: UIResponder.keyboardWillShowNotification, object: nil)
        center.addObserver(self, selector: #selector(keyboardWillHide), name: UIResponder.keyboardWillHideNotification, object: nil)
    }

    @objc private func keyboardWillShow() {
        keyboardUp = true
        updateVisibility()
    }

    @objc private func keyboardWillHide() {
        keyboardUp = false
        updateVisibility()
    }

    @objc func configure(_ call: CAPPluginCall) {
        let tabs = call.getArray("tabs", JSObject.self) ?? []
        let selected = call.getString("selected")
        DispatchQueue.main.async {
            guard let bar = self.ensureBar() else { return call.reject("No view to attach the tab bar to") }
            self.ids = tabs.compactMap { $0["id"] as? String }
            bar.items = tabs.enumerated().map { index, tab in
                let image = (tab["icon"] as? String).flatMap { UIImage(systemName: $0) }
                return UITabBarItem(title: tab["title"] as? String, image: image, tag: index)
            }
            self.applySelection(selected)
            call.resolve()
        }
    }

    @objc func select(_ call: CAPPluginCall) {
        let selected = call.getString("selected")
        DispatchQueue.main.async {
            self.applySelection(selected)
            call.resolve()
        }
    }

    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.wanted = true
            self.updateVisibility()
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.wanted = false
            self.updateVisibility()
            call.resolve()
        }
    }

    /// Follows a theme the user picked in the page. `system` must clear the override,
    /// or the web view's `prefers-color-scheme` would stay locked to it.
    @objc func setAppearance(_ call: CAPPluginCall) {
        let style: UIUserInterfaceStyle
        switch call.getString("style") {
        case "dark": style = .dark
        case "light": style = .light
        default: style = .unspecified
        }
        DispatchQueue.main.async {
            self.bridge?.viewController?.overrideUserInterfaceStyle = style
            call.resolve()
        }
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard ids.indices.contains(item.tag) else { return }
        feedback.selectionChanged()
        notifyListeners("tabSelected", data: ["id": ids[item.tag]])
    }

    private func ensureBar() -> UITabBar? {
        if let bar = tabBar { return bar }
        guard let view = bridge?.viewController?.view else { return nil }
        let bar = UITabBar()
        bar.delegate = self
        bar.tintColor = Self.sage
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            bar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -49),
        ])
        tabBar = bar
        return bar
    }

    private func applySelection(_ id: String?) {
        guard let bar = tabBar else { return }
        let index = id.flatMap { ids.firstIndex(of: $0) }
        bar.selectedItem = index.flatMap { bar.items?[$0] }
    }

    private func updateVisibility() {
        let show = wanted && !keyboardUp
        guard let bar = tabBar, show != visible else { return }
        visible = show
        if show { bar.isHidden = false }
        UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseOut, .beginFromCurrentState]) {
            bar.transform = show ? .identity : CGAffineTransform(translationX: 0, y: bar.bounds.height)
            bar.alpha = show ? 1 : 0
        } completion: { _ in
            if !self.visible { bar.isHidden = true }
        }
    }
}
