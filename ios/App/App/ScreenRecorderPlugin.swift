import Capacitor
import ReplayKit

// In-app screen recorder (owner only, see src/lib/screenRecorder.ts).
// The Control Center recorder loses ShareChef's sound while Micheli uses the
// mic. ReplayKit's in-app recorder captures the app's own screen and audio
// directly. On stop, Apple's preview sheet opens so the clip can be saved
// to Photos (no extra photo permission needed).
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

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let recorder = RPScreenRecorder.shared()
            guard recorder.isRecording else {
                call.reject("Not recording.")
                return
            }
            recorder.stopRecording { preview, error in
                DispatchQueue.main.async {
                    if let error = error {
                        call.reject(error.localizedDescription)
                        return
                    }
                    guard let preview = preview else {
                        call.reject("No video was produced.")
                        return
                    }
                    preview.previewControllerDelegate = self
                    preview.modalPresentationStyle = .fullScreen
                    self.bridge?.viewController?.present(preview, animated: true)
                    call.resolve(["recording": false])
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
