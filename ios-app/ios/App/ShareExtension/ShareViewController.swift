import UIKit
import UniformTypeIdentifiers

/// Receives a link from the share sheet and hands it to the Readfox app.
class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        findSharedLink { [weak self] link in
            guard let self = self else { return }
            if let link = link, let target = Self.appURL(for: link) {
                self.open(target)
            }
            self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }

    /// The first http or https link among the shared items.
    private func findSharedLink(_ done: @escaping (URL?) -> Void) {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        guard let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }) else {
            done(nil)
            return
        }
        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
            let url = item as? URL
            DispatchQueue.main.async {
                done(url.flatMap { ["http", "https"].contains($0.scheme?.lowercased() ?? "") ? $0 : nil })
            }
        }
    }

    static func appURL(for link: URL) -> URL? {
        var parts = URLComponents()
        parts.scheme = "readfox"
        parts.host = "share"
        parts.queryItems = [URLQueryItem(name: "url", value: link.absoluteString)]
        return parts.url
    }

    /// An extension cannot call UIApplication.shared, so walk the responder chain to the app.
    private func open(_ url: URL) {
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return
            }
            responder = current.next
        }
    }
}
