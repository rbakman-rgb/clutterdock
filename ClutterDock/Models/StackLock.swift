import CommonCrypto
import CryptoKit
import Foundation

/// Encrypted payload for a password-protected stack.
///
/// Format is deliberately identical to the Windows implementation
/// (`windows/src/stack-lock.js`) so `.clutterdock` packs stay portable:
/// PBKDF2-HMAC-SHA256 → 32-byte key → AES-256-GCM over the JSON item array.
struct FolderLock: Codable, Equatable, Hashable {
    var v: Int = 1
    /// base64 PBKDF2 salt (16 bytes)
    var salt: String
    var iter: Int
    /// base64 AES-GCM nonce (12 bytes)
    var nonce: String
    /// base64 ciphertext + 16-byte tag
    var ct: String
}

enum StackLock {
    static let iterations = 200_000

    enum LockError: LocalizedError {
        case wrongPassword
        case corrupted
        case emptyPassword

        var errorDescription: String? {
            switch self {
            case .wrongPassword: return "That password didn’t unlock this stack."
            case .corrupted: return "This stack’s locked data couldn’t be read."
            case .emptyPassword: return "Enter a password."
            }
        }
    }

    // MARK: - Key derivation

    /// PBKDF2-HMAC-SHA256. CryptoKit has no password-based KDF, so this uses
    /// CommonCrypto — HKDF is *not* a safe substitute for a user password.
    static func deriveKey(password: String, salt: Data, iterations: Int) throws -> SymmetricKey {
        let passwordBytes = Array(password.utf8)
        var derived = [UInt8](repeating: 0, count: 32)
        let status = salt.withUnsafeBytes { saltBuffer -> Int32 in
            CCKeyDerivationPBKDF(
                CCPBKDFAlgorithm(kCCPBKDF2),
                passwordBytes, passwordBytes.count,
                saltBuffer.bindMemory(to: UInt8.self).baseAddress, salt.count,
                CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                UInt32(iterations),
                &derived, derived.count
            )
        }
        guard status == kCCSuccess else { throw LockError.corrupted }
        return SymmetricKey(data: Data(derived))
    }

    // MARK: - Lock / unlock

    /// Encrypts `items` under `password`. The round-trip is verified before the
    /// caller drops the plaintext, so a bad encrypt can never lose a stack.
    static func lock(items: [DockItem], password: String) throws -> FolderLock {
        guard !password.isEmpty else { throw LockError.emptyPassword }

        var saltBytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, saltBytes.count, &saltBytes)
        let salt = Data(saltBytes)

        let key = try deriveKey(password: password, salt: salt, iterations: iterations)
        let plaintext = try JSONEncoder().encode(items)
        let sealed = try AES.GCM.seal(plaintext, using: key)
        guard let combined = sealed.combined else { throw LockError.corrupted }

        // combined = 12-byte nonce || ciphertext || 16-byte tag
        let nonce = combined.prefix(12)
        let body = combined.dropFirst(12)

        let lock = FolderLock(
            salt: salt.base64EncodedString(),
            iter: iterations,
            nonce: nonce.base64EncodedString(),
            ct: body.base64EncodedString()
        )

        // Never discard plaintext without proving it can be recovered
        let check = try unlock(lock, password: password)
        guard check == items else { throw LockError.corrupted }
        return lock
    }

    static func unlock(_ lock: FolderLock, password: String) throws -> [DockItem] {
        guard !password.isEmpty else { throw LockError.emptyPassword }
        guard let salt = Data(base64Encoded: lock.salt),
              let nonce = Data(base64Encoded: lock.nonce),
              let body = Data(base64Encoded: lock.ct) else {
            throw LockError.corrupted
        }
        let key = try deriveKey(password: password, salt: salt, iterations: lock.iter)
        do {
            let box = try AES.GCM.SealedBox(combined: nonce + body)
            let plaintext = try AES.GCM.open(box, using: key)
            return try JSONDecoder().decode([DockItem].self, from: plaintext)
        } catch {
            // A wrong password is indistinguishable from tampering by design
            throw LockError.wrongPassword
        }
    }

    /// Re-encrypts items for an already-unlocked stack, reusing its salt so the
    /// user's password keeps working.
    static func relock(items: [DockItem], existing: FolderLock, password: String) throws -> FolderLock {
        guard let salt = Data(base64Encoded: existing.salt) else { throw LockError.corrupted }
        let key = try deriveKey(password: password, salt: salt, iterations: existing.iter)
        let plaintext = try JSONEncoder().encode(items)
        let sealed = try AES.GCM.seal(plaintext, using: key)
        guard let combined = sealed.combined else { throw LockError.corrupted }
        return FolderLock(
            v: existing.v,
            salt: existing.salt,
            iter: existing.iter,
            nonce: combined.prefix(12).base64EncodedString(),
            ct: combined.dropFirst(12).base64EncodedString()
        )
    }
}
