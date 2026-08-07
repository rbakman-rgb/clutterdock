# Manual SDPRO license key ops (RON-415)

Seller-side runbook until merchant checkout auto-emails keys (G2).  
Customers activate in **Settings → Pro**. Same key unlocks Mac + Windows.

## Format

```text
SDPRO-XXXX-YYYY-ZZZZ
```

- `XXXX` — 4-character serial you choose (A–Z, 0–9)
- `YYYY-ZZZZ` — HMAC signature derived from the serial (offline validation)

Built-in **dev/test** unlock (never sell this):

```text
SDPRO-TEST-UNLOCK-2026
```

## Generate a customer key

From the repo root (Mac):

```bash
swift scripts/generate-license.swift AB12
# → SDPRO-AB12-….….
```

Multiple serials:

```bash
swift scripts/generate-license.swift CUST ORDR RON1
```

Windows / Node (same crypto):

```bash
cd windows
node scripts/generate-license.js AB12
```

Serial rules: exactly **4** alphanumeric characters. Re-running the same serial always yields the same key.

## Fulfillment checklist (manual sale)

1. Collect payment (invoice, PayPal, coffee tip + DM, etc.).
2. Pick a unique serial (order id fragment, initials + digits). Avoid reuse for different buyers.
3. Generate the key with the script above.
4. Email the buyer:
   - The key (plain text, one line)
   - Activate: open ClutterDock → **Settings → Pro** → paste → Activate
   - Works on Mac and Windows; no account
   - Support: GitHub Issues on `rbakman-rgb/clutterdock`
5. Log the sale privately (date, serial, channel, amount). Do **not** commit the sales log to git.

Suggested private log columns: `date | serial | key | buyer | amount | notes`

## Support

| Issue | Action |
|-------|--------|
| “Invalid key” | Confirm full `SDPRO-…` string, no spaces/smart quotes; regenerate from the same serial if they mistyped |
| Lost key | Look up serial in your private log and resend the same key |
| Want Multi / 5 devices | Same offline key model today — issue one key per household purchase; document device count in the sales log |
| Refund | Deactivate is local-only (Settings → Pro). Note refund in log; do not re-sell that serial |

## Security notes

- The HMAC secret lives in app source + generator scripts for offline validation (standard offline-key tradeoff). Do **not** paste it into marketing pages, emails, or public docs.
- Do not publish `SDPRO-TEST-UNLOCK-2026` as a customer offer.
- When Lemon Squeezy / Gumroad / Paddle is wired (RON-364+), prefer auto-email from checkout; keep this doc for overrides and comps.

## Related

- Product limits / pricing: [PRICING.md](PRICING.md)
- Ship checklist: [SHIP.md](SHIP.md)
- Generator: `scripts/generate-license.swift`, `windows/scripts/generate-license.js`
