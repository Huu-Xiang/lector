import UIKit
import UniformTypeIdentifiers

/// Receives a link from the share sheet and hands it to the Readfox app.
class ShareViewController: UIViewController {
    private var linkCandidates: [(NSItemProvider, String)] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        findSharedLink { [weak self] link in
            guard let self = self else { return }
            guard let link, let target = Self.appURL(for: link) else {
                self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
                return
            }
            self.open(target) { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
            }
        }
    }

    private func findSharedLink(_ done: @escaping @MainActor @Sendable (URL?) -> Void) {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        linkCandidates = [UTType.url.identifier, UTType.plainText.identifier].flatMap { type in
            providers.filter { $0.hasItemConformingToTypeIdentifier(type) }.map { ($0, type) }
        }
        loadLink(at: 0, completion: done)
    }

    private func loadLink(at index: Int, completion: @escaping @MainActor @Sendable (URL?) -> Void) {
        guard linkCandidates.indices.contains(index) else {
            completion(nil)
            return
        }
        let (provider, type) = linkCandidates[index]
        provider.loadItem(forTypeIdentifier: type, options: nil) { [weak self] item, _ in
            let link = (item as? URL).flatMap(Self.webURL)
                ?? (item as? String).flatMap(Self.linkInText)
            DispatchQueue.main.async {
                guard let self else { return }
                if let link {
                    completion(link)
                } else {
                    self.loadLink(at: index + 1, completion: completion)
                }
            }
        }
    }

    nonisolated private static func webURL(_ url: URL) -> URL? {
        ["http", "https"].contains(url.scheme?.lowercased() ?? "") && url.host != nil ? url : nil
    }

    nonisolated private static func linkInText(_ text: String) -> URL? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return nil }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return detector.matches(in: text, range: range).compactMap { $0.url.flatMap(webURL) }.first
    }

    static func appURL(for link: URL) -> URL? {
        var parts = URLComponents()
        parts.scheme = "readfox"
        parts.host = "share"
        parts.queryItems = [URLQueryItem(name: "url", value: link.absoluteString)]
        return parts.url
    }

    /// An extension cannot call UIApplication.shared, so walk the responder chain to the app.
    private func open(_ url: URL, completion: @escaping @MainActor @Sendable () -> Void) {
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                application.open(url, options: [:]) { _ in
                    DispatchQueue.main.async { completion() }
                }
                return
            }
            responder = current.next
        }
        completion()
    }
}
