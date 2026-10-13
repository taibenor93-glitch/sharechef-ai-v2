import Capacitor
import ReplayKit
import AVFoundation
import Photos

// In-app screen recorder (owner only, see src/lib/screenRecorder.ts).
// The Control Center recorder loses ShareChef's sound while Micheli uses the
// mic. ReplayKit's in-app recorder captures the app's own screen and audio
// video directly, but not WebKit audio, so JS keeps a sound tape that is
// joined onto the video on stop. The result saves to Photos.
@objc(ScreenRecorderPlugin)
public class ScreenRecorderPlugin: CAPPlugin, CAPBridgedPlugin, RPPreviewViewControllerDelegate {
    public let identifier = "ScreenRecorderPlugin"
    public let jsName = "ScreenRecorder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isRecording", returnType: CAPPluginReturnPromise)
    ]

    @objc func isRecording(_ call: CAPPluginCall) {
        call.resolve(["recording": RPScreenRecorder.shared().isRecording])
    }

    @objc func start(_ call: CAPPluginCall) {
        let mic = call.getBool("microphone") ?? true
        DispatchQueue.main.async {
            let recorder = RPScreenRecorder.shared()
            guard recorder.isAvailable else {
                call.reject("Screen recording is not available right now.")
                return
            }
            if recorder.isRecording {
                call.resolve(["recording": true])
                return
            }
            recorder.isMicrophoneEnabled = mic
            recorder.startRecording { error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["recording": true])
                }
            }
        }
    }

    // Stops ReplayKit, writes the (silent) screen video to a temp file, joins
    // the app's own sound tape (WAV from JS) onto it, and saves to Photos.
    @objc func stop(_ call: CAPPluginCall) {
        let wavBase64 = call.getString("audioWav") ?? ""
        DispatchQueue.main.async {
            let recorder = RPScreenRecorder.shared()
            guard recorder.isRecording else {
                call.reject("Not recording.")
                return
            }
            let tmp = FileManager.default.temporaryDirectory
            let stamp = Int(Date().timeIntervalSince1970)
            let videoURL = tmp.appendingPathComponent("sc-screen-\(stamp).mp4")
            recorder.stopRecording(withOutput: videoURL) { error in
                if let error = error {
                    call.reject("Recording failed: \(error.localizedDescription)")
                    return
                }
                guard let wavData = Data(base64Encoded: wavBase64), wavData.count > 44 else {
                    self.saveToPhotos(videoURL, call: call)
                    return
                }
                let wavURL = tmp.appendingPathComponent("sc-sound-\(stamp).wav")
                let outURL = tmp.appendingPathComponent("sc-cook-\(stamp).mp4")
                do {
                    try wavData.write(to: wavURL)
                } catch {
                    call.reject("Could not save the sound: \(error.localizedDescription)")
                    return
                }
                Task {
                    do {
                        try await self.merge(video: videoURL, audio: wavURL, output: outURL)
                        self.saveToPhotos(outURL, call: call)
                    } catch {
                        call.reject("Could not add the sound: \(error.localizedDescription)")
                    }
                }
            }
        }
    }

    private func merge(video: URL, audio: URL, output: URL) async throws {
        let videoAsset = AVURLAsset(url: video)
        let audioAsset = AVURLAsset(url: audio)
        let comp = AVMutableComposition()
        guard let vSrc = try await videoAsset.loadTracks(withMediaType: .video).first,
              let vDst = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw NSError(domain: "ScreenRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "No video track."])
        }
        let vDuration = try await videoAsset.load(.duration)
        try vDst.insertTimeRange(CMTimeRange(start: .zero, duration: vDuration), of: vSrc, at: .zero)
        vDst.preferredTransform = try await vSrc.load(.preferredTransform)
        if let aSrc = try await audioAsset.loadTracks(withMediaType: .audio).first,
           let aDst = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
            let aDuration = try await audioAsset.load(.duration)
            let len = CMTimeMinimum(aDuration, vDuration)
            try aDst.insertTimeRange(CMTimeRange(start: .zero, duration: len), of: aSrc, at: .zero)
        }
        guard let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality) else {
            throw NSError(domain: "ScreenRecorder", code: 2, userInfo: [NSLocalizedDescriptionKey: "Export not available."])
        }
        export.outputURL = output
        export.outputFileType = .mp4
        await export.export()
        if export.status != .completed {
            throw export.error ?? NSError(domain: "ScreenRecorder", code: 3, userInfo: [NSLocalizedDescriptionKey: "Export failed."])
        }
    }

    private func saveToPhotos(_ url: URL, call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("Photos access was not allowed. Turn it on in Settings, ShareChef, Photos.")
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }) { ok, error in
                if ok {
                    call.resolve(["saved": true])
                } else {
                    call.reject("Could not save to Photos: \(error?.localizedDescription ?? "unknown error")")
                }
            }
        }
    }

    public func previewControllerDidFinish(_ previewController: RPPreviewViewController) {
        DispatchQueue.main.async {
            previewController.dismiss(animated: true)
        }
    }
}
