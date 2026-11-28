import UIKit
import Capacitor

@objc(NativeActionSheetPlugin)
public class NativeActionSheetPlugin: CAPPlugin, CAPBridgedPlugin, UIPopoverPresentationControllerDelegate {
    public let identifier = "NativeActionSheetPlugin"
    public let jsName = "NativeActionSheet"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "confirm", returnType: CAPPluginReturnPromise),
    ]
    private var pending: CAPPluginCall?

    @objc func confirm(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pending == nil,
                  let host = self.bridge?.viewController,
                  host.presentedViewController == nil,
                  let label = call.getString("confirmLabel")
            else { return call.resolve(["confirmed": false]) }
            let sheet = UIAlertController(title: call.getString("title"), message: call.getString("message"), preferredStyle: .actionSheet)
            sheet.addAction(UIAlertAction(title: label, style: call.getBool("destructive") == true ? .destructive : .default) { [weak self] _ in
                self?.finish(true)
            })
            sheet.addAction(UIAlertAction(title: call.getString("cancelLabel") ?? NSLocalizedString("Cancel", comment: ""), style: .cancel) { [weak self] _ in
                self?.finish(false)
            })
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = host.view
                popover.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.maxY - host.view.safeAreaInsets.bottom, width: 0, height: 0)
                popover.permittedArrowDirections = []
                popover.delegate = self
            }
            self.pending = call
            host.present(sheet, animated: !UIAccessibility.isReduceMotionEnabled)
            sheet.presentationController?.delegate = self
        }
    }

    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        finish(false)
    }

    public func popoverPresentationControllerDidDismissPopover(_ popoverPresentationController: UIPopoverPresentationController) {
        finish(false)
    }

    private func finish(_ confirmed: Bool) {
        pending?.resolve(["confirmed": confirmed])
        pending = nil
    }
}
