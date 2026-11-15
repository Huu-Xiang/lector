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
    }
}
