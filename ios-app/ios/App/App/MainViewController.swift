import UIKit
import WebKit
import Capacitor

/// The storyboard's root view controller. Registers the app's own plugins and turns on the edge swipe back.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeTabBarPlugin())
        bridge?.registerPluginInstance(ReviewWidgetPlugin())
    }

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        let version = ProcessInfo.processInfo.operatingSystemVersion.majorVersion
        configuration.applicationNameForUserAgent =
            [configuration.applicationNameForUserAgent, "ReadfoxOS/\(version)"]
                .compactMap { $0 }
                .joined(separator: " ")
        return configuration
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
        let dynamicBg = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0x17 / 255.0, green: 0x14 / 255.0, blue: 0x0f / 255.0, alpha: 1)
                : UIColor(red: 0xf3 / 255.0, green: 0xee / 255.0, blue: 0xe3 / 255.0, alpha: 1)
        }
        view.backgroundColor = dynamicBg
        webView?.isOpaque = false
        webView?.backgroundColor = dynamicBg
        webView?.scrollView.backgroundColor = dynamicBg
    }
}
