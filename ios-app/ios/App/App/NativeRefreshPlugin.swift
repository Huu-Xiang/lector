import UIKit
import Capacitor

@objc(NativeRefreshPlugin)
public class NativeRefreshPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeRefreshPlugin"
    public let jsName = "NativeRefresh"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endRefreshing", returnType: CAPPluginReturnPromise),
    ]
    private var control: UIRefreshControl?
    private var previousBounce: Bool?

    @objc func setEnabled(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let scroll = self.bridge?.webView?.scrollView else { return call.resolve() }
            if call.getBool("enabled") == true {
                if self.control == nil {
                    self.previousBounce = scroll.alwaysBounceVertical
                    let control = UIRefreshControl()
                    control.tintColor = UIColor(red: 0x2f / 255, green: 0x8a / 255, blue: 0x76 / 255, alpha: 1)
                    control.addTarget(self, action: #selector(self.refresh), for: .valueChanged)
                    self.control = control
                }
                scroll.refreshControl = self.control
                scroll.alwaysBounceVertical = true
            } else {
                self.control?.endRefreshing()
                scroll.refreshControl = nil
                if let previousBounce = self.previousBounce { scroll.alwaysBounceVertical = previousBounce }
                self.previousBounce = nil
                self.control = nil
            }
            call.resolve()
        }
    }

    @objc private func refresh() {
        let feedback = UIImpactFeedbackGenerator(style: .light)
        feedback.prepare()
        feedback.impactOccurred()
        notifyListeners("refresh", data: [:])
    }

    @objc func endRefreshing(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.control?.endRefreshing()
            call.resolve()
        }
    }
}
