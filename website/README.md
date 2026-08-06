# ClutterDock website

Static marketing + pricing site (Warp-inspired layout).

## Preview locally

```bash
cd website
python3 -m http.server 5173
# open http://localhost:5173/pricing.html
```

Or open `index.html` / `pricing.html` directly in a browser.

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Product landing |
| `pricing.html` | Plans, comparison table, FAQ, download |
| `css/styles.css` | Shared dark theme |
| `assets/` | App icons |

## Content source of truth

Pricing numbers and Free/Pro limits come from [`docs/PRICING.md`](../docs/PRICING.md).

## Placeholders to replace when shipping

1. **Download links** — point Mac/Windows buttons at GitHub Releases (or notarized DMG / installer).
2. **Checkout** — wire “Unlock Pro” / “Get Pro Multi” to Lemon Squeezy, Gumroad, or Paddle.
3. **Domain** — deploy `website/` to GitHub Pages, Cloudflare Pages, Netlify, or similar.

Do not publish license generator secrets on this site.
