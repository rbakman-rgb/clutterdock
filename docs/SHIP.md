# Shipping SlaveDock

## Public URLs

| What | URL |
|------|-----|
| Repo | https://github.com/rbakman-rgb/slavedock |
| Releases | https://github.com/rbakman-rgb/slavedock/releases |
| Website | https://rbakman-rgb.github.io/slavedock/ |
| Pricing | https://rbakman-rgb.github.io/slavedock/pricing.html |

## Release checklist

### Every version

1. Bump version in:
   - `SlaveDock/Info.plist` (`CFBundleShortVersionString` + `CFBundleVersion`)
   - `windows/package.json` `version` (when shipping Windows)
   - README version blurb
2. `git commit` + `git tag vX.Y.Z` + `git push origin main --tags`
3. GitHub Actions **Release** workflow builds Mac zip + Windows exe and publishes the release
4. Confirm download links on the website still match the latest tag pattern

### Manual Mac-only package (this machine)

```bash
./scripts/package-mac.sh
# → dist/SlaveDock-<version>-mac.zip
gh release create vX.Y.Z dist/SlaveDock-*-mac.zip --generate-notes
```

### First-time GitHub Pages

1. Repo **Settings → Pages → Source**: GitHub Actions  
2. Push to `main` (or run **Deploy website** workflow)  
3. Site: `https://rbakman-rgb.github.io/slavedock/`

### Make the product public

```bash
gh repo edit rbakman-rgb/slavedock --visibility public
```

## Still manual / blocked without accounts

| Item | Why | Owner action |
|------|-----|----------------|
| **Pro checkout** | Lemon Squeezy / Gumroad / Paddle product + auto key email | Create store product; point website “Unlock Pro” at checkout URL; optional webhook to generate keys |
| **Apple notarization** | No Developer ID cert on this Mac | Enroll Apple Developer ($99), create Developer ID Application cert, update `build.sh` / notarize script |
| **Custom domain** | Optional | DNS → GitHub Pages |
| **Sparkle silent Mac replace** | GitHub check ships; full Sparkle later | After notarization |
| **Linear project** | MCP needs OAuth / API key | See docs/LINEAR.md · `node scripts/linear-seed-slavedock.mjs` |

## License keys (seller side)

```bash
swift scripts/generate-license.swift A1B2 CUST
```

- Format: `SDPRO-XXXX-YYYY-ZZZZ`
- Do not publish the HMAC secret in marketing copy (it lives in app source for offline validation — standard offline-key tradeoff)
- Test key for development only: see `docs/PRICING.md` (not for customers)

## Gatekeeper note (unsigned Mac builds)

Until notarized:

1. Unzip SlaveDock  
2. Drag to Applications  
3. **Right-click → Open** the first time (or System Settings → Privacy & Security → Open Anyway)

## Windows note

Preferred path: tag a release and let CI build on `windows-latest`.  
Local: run `npm run dist` **on a Windows machine**.
