import UIKit
import WebKit
import Capacitor

/// Shares selection between the bottom UITabBar and the iPad glass toolbar.
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
        CAPPluginMethod(name: "setGlassFrame", returnType: CAPPluginReturnPromise),
    ]

    private var tabBar: UITabBar?
    private var ids: [String] = []
    private var glassBar: UIVisualEffectView?
    private var glassStack: UIStackView?
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

    deinit {
        NotificationCenter.default.removeObserver(self)
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
            if #available(iOS 26.0, *) { self.rebuildGlassTabs() }
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

    @objc func setGlassFrame(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard #available(iOS 26.0, *),
                  let webView = self.bridge?.webView,
                  let host = self.bridge?.viewController?.view,
                  host.traitCollection.horizontalSizeClass == .regular,
                  let x = call.getDouble("x"), let y = call.getDouble("y"),
                  let width = call.getDouble("width"), let height = call.getDouble("height"),
                  [x, y, width, height].allSatisfy({ $0.isFinite }),
                  width > 0, height >= 52
            else {
                self.glassBar?.isHidden = true
                return call.resolve(["shown": false])
            }

            let frame = webView.convert(CGRect(x: x, y: y, width: width, height: height), to: host)
            let glass = self.ensureGlassBar(in: host)
            guard host.bounds.contains(frame), let stack = self.glassStack,
                  !stack.arrangedSubviews.isEmpty,
                  stack.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize).width + 8 <= frame.width
            else {
                glass.isHidden = true
                return call.resolve(["shown": false])
            }
            glass.frame = frame
            glass.isHidden = false
            call.resolve(["shown": true])
        }
    }

    @available(iOS 26.0, *)
    private func ensureGlassBar(in host: UIView) -> UIVisualEffectView {
        if let glassBar { return glassBar }
        let effect = UIGlassEffect(style: .regular)
        effect.isInteractive = true
        let glass = UIVisualEffectView(effect: effect)
        glass.cornerConfiguration = .capsule()
        glass.isHidden = true
        let stack = UIStackView()
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        glass.contentView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: glass.contentView.leadingAnchor, constant: 4),
            stack.trailingAnchor.constraint(equalTo: glass.contentView.trailingAnchor, constant: -4),
            stack.topAnchor.constraint(equalTo: glass.contentView.topAnchor, constant: 4),
            stack.bottomAnchor.constraint(equalTo: glass.contentView.bottomAnchor, constant: -4),
        ])
        host.addSubview(glass)
        glassBar = glass
        glassStack = stack
        rebuildGlassTabs()
        applySelection(tabBar?.selectedItem.flatMap { ids.indices.contains($0.tag) ? ids[$0.tag] : nil })
        return glass
    }

    @available(iOS 26.0, *)
    private func rebuildGlassTabs() {
        guard let stack = glassStack else { return }
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for item in tabBar?.items ?? [] {
            let button = UIButton()
            var config = UIButton.Configuration.plain()
            config.title = item.title
            config.image = item.image?.withConfiguration(UIImage.SymbolConfiguration(pointSize: 14))
            config.imagePadding = 5
            config.baseForegroundColor = .label
            config.cornerStyle = .capsule
            config.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 9, bottom: 4, trailing: 9)
            config.titleLineBreakMode = .byTruncatingTail
            config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
                var text = attributes
                let base = UIFont.systemFont(ofSize: 14, weight: .semibold)
                let rounded = base.fontDescriptor.withDesign(.rounded) ?? base.fontDescriptor
                text.font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(for: UIFont(descriptor: rounded, size: 14))
                return text
            }
            button.configuration = config
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.widthAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
            button.tag = item.tag
            button.addAction(UIAction { [weak self] _ in self?.openTab(item.tag) }, for: .touchUpInside)
            button.configurationUpdateHandler = { button in
                button.configuration?.background.backgroundColor = button.isSelected
                    ? Self.sage.withAlphaComponent(UIAccessibility.isDarkerSystemColorsEnabled ? 0.35 : 0.17)
                    : .clear
            }
            stack.addArrangedSubview(button)
        }
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        openTab(item.tag)
    }

    private func openTab(_ index: Int) {
        guard ids.indices.contains(index) else { return }
        feedback.prepare()
        feedback.selectionChanged()
        notifyListeners("tabSelected", data: ["id": ids[index]])
    }

    private func ensureBar() -> UITabBar? {
        if let bar = tabBar { return bar }
        guard let view = bridge?.viewController?.view else { return nil }
        let bar = UITabBar()
        bar.delegate = self
        bar.tintColor = Self.sage
        if #available(iOS 26.0, *) {
        } else {
            let appearance = UITabBarAppearance()
            appearance.configureWithDefaultBackground()
            for item in [appearance.stackedLayoutAppearance, appearance.inlineLayoutAppearance, appearance.compactInlineLayoutAppearance] {
                item.selected.iconColor = Self.sage
                item.selected.titleTextAttributes = [.foregroundColor: Self.sage]
                item.normal.iconColor = .secondaryLabel
                item.normal.titleTextAttributes = [.foregroundColor: UIColor.secondaryLabel]
            }
            bar.standardAppearance = appearance
            if #available(iOS 15.0, *) {
                bar.scrollEdgeAppearance = appearance
            }
        }
        bar.sizeToFit()
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        tabBar = bar
        return bar
    }

    private func applySelection(_ id: String?) {
        guard let bar = tabBar else { return }
        let index = id.flatMap { ids.firstIndex(of: $0) }
        bar.selectedItem = index.flatMap { bar.items?[$0] }
        for case let button as UIButton in glassStack?.arrangedSubviews ?? [] {
            button.isSelected = button.tag == index
            if button.isSelected {
                button.accessibilityTraits.insert(.selected)
            } else {
                button.accessibilityTraits.remove(.selected)
            }
        }
    }

    private func updateVisibility() {
        let show = wanted && !keyboardUp
        guard let bar = tabBar, show != visible else { return }
        visible = show
        if show { bar.isHidden = false }
        if UIAccessibility.isReduceMotionEnabled {
            bar.layer.removeAllAnimations()
            bar.transform = .identity
            bar.alpha = show ? 1 : 0
            bar.isHidden = !show
            return
        }
        UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseOut, .beginFromCurrentState]) {
            bar.transform = show ? .identity : CGAffineTransform(translationX: 0, y: bar.bounds.height)
            bar.alpha = show ? 1 : 0
        } completion: { [weak self] _ in
            if self?.visible == false { bar.isHidden = true }
        }
    }
}
