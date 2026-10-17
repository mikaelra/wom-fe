import Capacitor
import UIKit

/// The app's web view, with the app's own native plugins registered
/// (plugins from npm packages are found automatically; ones living in this
/// Xcode project are not).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WomStoreKitPlugin())
    }
}
