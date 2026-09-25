# Receipt-key activation (RON-366 / RON-368)

Mac 1.4.11 and Windows 1.3.2 accept the Lemon Squeezy license key emailed with
an order. Existing SDPRO keys still validate and activate entirely offline.

The apps exchange a receipt key once via `POST https://clutterdock.com/api/license/claim`.
The Worker calls Lemon Squeezy's public License API, verifies the live store and
product allowlist, rejects invalid/disabled/expired/test products, then returns
a signed offline `CDPRO2` entitlement. Subsequent launches require no server.
Each device can use the same original receipt key. Limits are fair-use license
terms, as with the existing SDPRO format; no device identifiers are collected.

`CDPRO2-<32 uppercase hex>-<32 uppercase hex>` contains the first 128 bits of
SHA-256 of the normalized receipt key and the first 128 bits of HMAC-SHA256 of
`CDPRO2:<fingerprint>`. This avoids the legacy four-character serial collision
limit without storing a customer database. The existing production product
secret signs the result. It is a Worker secret, never a repository variable.
There is no automatic revocation of already issued offline entitlements;
refund/disable stops future exchanges. This preserves the offline product promise.

## Merchant configuration

- Store BYC Labs LLC: **449735** (`byclabs.lemonsqueezy.com`).
- Pro: live product **1386437**, **$14.99** once, personal license.
- Pro Multi: live product **1386442**, **$29** once, up to 5 household devices.
- Both products: Software tax category, generated license keys, unlimited length
  and activation count (the app uses validation, not merchant device instances).
- Receipt note: download current app; paste order license key in Settings → Pro.
- Products remain drafts until the activation endpoint and customer binaries
  are deployed and verified. Checkout URLs are recorded in `checkout-config.js`
  only after they are obtained from the merchant UI.

## Deployment

Upload `LICENSE_SECRET` with Wrangler from the existing private license-secret
file without printing it. Keep `LEMON_STORE_ID` and `LEMON_PRODUCT_IDS` limited
to the live products above; Lemon Squeezy test products have separate IDs.
The endpoint fails closed when any required setting or rate-limit binding is
missing. It accepts at most 1 KB, bounds merchant responses to 16 KB, uses a
10-second timeout, and returns no-store responses. It logs no keys or identity.

Run `node --test scripts/tests/license-claim.test.mjs`, `scripts/test-mac.sh`,
and Windows unit tests. The shared non-shipping proof vector verifies the
Worker output in both platform validators, including tamper rejection.

## Release process

The release workflow creates a **draft**, retaining Windows updater metadata
and blockmaps. Verify its assets, replace the Mac zip with the Developer ID
signed build, then publish. For local signing use an un-synced build directory:

```sh
CLUTTERDOCK_BUILD_DIR=/private/tmp/clutterdock-release-build \
CLUTTERDOCK_SIGN_IDENTITY='Developer ID Application: Ronald Bakman (5F78F8AUJK)' \
./scripts/package-mac.sh
```

Developer ID signing and Apple notarization are separate. Do not describe an
artifact as notarized unless `notarytool` accepts it and the ticket is stapled.
