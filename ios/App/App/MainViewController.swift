import UIKit
import Capacitor

// Registers app-local Capacitor plugins (ScreenRecorderPlugin).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ScreenRecorderPlugin())
    }
}
