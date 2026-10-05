import Capacitor
import StoreKit
import UIKit

/// The shop's App Store purchases (StoreKit 2), exposed to the web app as
/// `WomStoreKit` (src/lib/appleShop.ts). Apple guideline 3.1.1 rules out the
/// web shop's Stripe Checkout inside the app.
///
/// The phone only buys; the backend decides. Every purchase's signed
/// transaction (JWS) goes to wom-be's /shop/apple/verify, and the web app
/// calls `finish` only once the backend has given a final answer -- until
/// then the transaction stays in StoreKit's unfinished queue and comes back
/// from `unfinished` (or the `transaction` event) on the next launch, so a
/// crash or a lost connection mid-purchase never loses a sale.
@objc(WomStoreKitPlugin)
public class WomStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WomStoreKitPlugin"
    public let jsName = "WomStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unfinished", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "storefront", returnType: CAPPluginReturnPromise),
    ]

    private var updates: Task<Void, Never>?

    override public func load() {
        // Purchases that complete outside a purchase() call: Ask to Buy
        // approvals, a purchase interrupted by the app closing, refunds.
        updates = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                self.notifyListeners("transaction", data: self.payload(result))
            }
        }
    }

    deinit {
        updates?.cancel()
    }

    private func payload(_ result: VerificationResult<Transaction>) -> [String: Any] {
        // Unverified results are passed on too: the backend's signature
        // check is the one that counts.
        let transaction: Transaction
        switch result {
        case .verified(let t), .unverified(let t, _):
            transaction = t
        }
        return [
            "jws": result.jwsRepresentation,
            "transactionId": String(transaction.id),
            "productId": transaction.productID,
        ]
    }

    @objc func products(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids") ?? []).compactMap { $0 as? String }
        Task {
            do {
                let products = try await Product.products(for: ids)
                call.resolve(["products": products.map { product in
                    [
                        "id": product.id,
                        "displayName": product.displayName,
                        "displayPrice": product.displayPrice,
                    ]
                }])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Missing product id")
            return
        }
        let quantity = max(1, call.getInt("quantity") ?? 1)
        let token = call.getString("appAccountToken").flatMap { UUID(uuidString: $0) }
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.reject("Unknown product")
                    return
                }
                var options: Set<Product.PurchaseOption> = [.quantity(quantity)]
                if let token {
                    options.insert(.appAccountToken(token))
                }
                let result: Product.PurchaseResult
                if #available(iOS 17.0, *), let scene = self.bridge?.viewController?.view.window?.windowScene {
                    result = try await product.purchase(confirmIn: scene, options: options)
                } else {
                    result = try await product.purchase(options: options)
                }
                switch result {
                case .success(let verification):
                    var data = self.payload(verification)
                    data["status"] = "purchased"
                    call.resolve(data)
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    // Ask to Buy / Strong Customer Authentication: it
                    // arrives later through the `transaction` event.
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "pending"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let id = call.getString("transactionId").flatMap({ UInt64($0) }) else {
            call.reject("Missing transaction id")
            return
        }
        Task {
            for await result in Transaction.unfinished {
                if case .verified(let t) = result, t.id == id {
                    await t.finish()
                } else if case .unverified(let t, _) = result, t.id == id {
                    await t.finish()
                }
            }
            call.resolve()
        }
    }

    @objc func unfinished(_ call: CAPPluginCall) {
        Task {
            var transactions: [[String: Any]] = []
            for await result in Transaction.unfinished {
                transactions.append(self.payload(result))
            }
            call.resolve(["transactions": transactions])
        }
    }

    @objc func storefront(_ call: CAPPluginCall) {
        Task {
            let storefront = await Storefront.current
            call.resolve(["countryCode": storefront?.countryCode ?? NSNull()])
        }
    }
}
