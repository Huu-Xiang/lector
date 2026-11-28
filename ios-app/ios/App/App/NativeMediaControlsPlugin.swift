import AVFoundation
import MediaPlayer
import UIKit
import Capacitor

@objc(NativeMediaControlsPlugin)
public class NativeMediaControlsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeMediaControlsPlugin"
    public let jsName = "NativeMediaControls"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]
    private var targets: [(MPRemoteCommand, Any)] = []
    private var sessionActive = false
    private lazy var artwork: MPMediaItemArtwork? = {
        let icons = Bundle.main.infoDictionary?["CFBundleIcons"] as? [String: Any]
        let primary = icons?["CFBundlePrimaryIcon"] as? [String: Any]
        let names = primary?["CFBundleIconFiles"] as? [String]
        guard let name = names?.last, let image = UIImage(named: name) else { return nil }
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }()

    @objc func update(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                if !self.sessionActive {
                    let session = AVAudioSession.sharedInstance()
                    try session.setCategory(.playback, mode: .spokenAudio, options: [.allowBluetoothA2DP, .allowAirPlay])
                    try session.setActive(true)
                    self.sessionActive = true
                }
            } catch {
                call.reject("Could not activate media playback", nil, error)
                return
            }
            self.registerCommands()
            let playing = call.getBool("playing") ?? false
            var info: [String: Any] = [
                MPMediaItemPropertyTitle: call.getString("title") ?? "",
                MPMediaItemPropertyArtist: call.getString("artist") ?? "Readfox",
                MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
            ]
            if let album = call.getString("album") { info[MPMediaItemPropertyAlbumTitle] = album }
            let duration = call.getDouble("duration")
            if let duration, duration.isFinite, duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
            if let elapsed = call.getDouble("elapsed"), elapsed.isFinite {
                info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = max(0, min(elapsed, duration.flatMap { $0.isFinite && $0 > 0 ? $0 : nil } ?? elapsed))
            }
            if let artwork = self.artwork { info[MPMediaItemPropertyArtwork] = artwork }
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            let commands = MPRemoteCommandCenter.shared()
            commands.playCommand.isEnabled = true
            commands.pauseCommand.isEnabled = true
            commands.togglePlayPauseCommand.isEnabled = true
            commands.nextTrackCommand.isEnabled = call.getBool("canNext") ?? true
            commands.previousTrackCommand.isEnabled = call.getBool("canPrevious") ?? true
            commands.skipForwardCommand.isEnabled = call.getBool("canSeek") ?? false
            commands.skipBackwardCommand.isEnabled = call.getBool("canSeek") ?? false
            call.resolve()
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            for (command, _) in self.targets { command.isEnabled = false }
            do {
                if self.sessionActive {
                    try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                    self.sessionActive = false
                }
                call.resolve()
            } catch {
                call.reject("Could not deactivate media playback", nil, error)
            }
        }
    }

    private func registerCommands() {
        guard targets.isEmpty else { return }
        let center = MPRemoteCommandCenter.shared()
        center.skipForwardCommand.preferredIntervals = [5]
        center.skipBackwardCommand.preferredIntervals = [5]
        let commands: [(MPRemoteCommand, String)] = [
            (center.playCommand, "play"), (center.pauseCommand, "pause"),
            (center.togglePlayPauseCommand, "toggle"), (center.nextTrackCommand, "next"),
            (center.previousTrackCommand, "previous"), (center.skipForwardCommand, "seekForward"),
            (center.skipBackwardCommand, "seekBackward"),
        ]
        for (command, action) in commands {
            let target = command.addTarget { [weak self] _ in
                DispatchQueue.main.async { [weak self] in
                    self?.notifyListeners("mediaCommand", data: ["action": action])
                }
                return .success
            }
            targets.append((command, target))
        }
    }

    deinit {
        for (command, target) in targets { command.removeTarget(target) }
    }
}
