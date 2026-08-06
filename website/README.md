# ClutterDock website

Static marketing + pricing site for **https://clutterdock.com** (also **clutterdock.app**).

## Preview locally

```bash
cd website
python3 -m http.server 5173
# open http://localhost:5173/
```

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Product landing + install tips |
| `pricing.html` | Plans, comparison, FAQ, download |
| `privacy.html` | Privacy policy |
| `css/styles.css` | Shared dark theme |
| `assets/` | Real app icon only (no fake UI screenshots) |
| `CNAME` | `clutterdock.com` for custom domain |
| `robots.txt` / `sitemap.xml` | SEO |

## Deploy

**GitHub Pages** (repo `rbakman-rgb/clutterdock`):

1. Repo must be **public** (free plan) or on a plan that allows Pages for private repos.
2. Settings → Pages → Source: **GitHub Actions**.
3. Push to `main` (or run **Deploy website** workflow).
4. Optional custom domain: DNS for `clutterdock.com` → GitHub Pages; `CNAME` file is already in this folder.
5. Also point `clutterdock.app` (CNAME or redirect) to the same site if desired.

**Fallback hosts:** Cloudflare Pages, Netlify, or any static host — publish the `website/` directory.

## Content source of truth

Pricing numbers and Free/Pro limits come from [`docs/PRICING.md`](../docs/PRICING.md).

## Placeholders still manual

1. **Checkout** — wire “Unlock Pro” / “Get Pro Multi” to Lemon Squeezy, Gumroad, or Paddle.
2. **DNS** — apex + www for clutterdock.com (and clutterdock.app) once hosting is live.

Do not publish license generator secrets on this site.

## Product screenshots

Do **not** use generated “before/after Dock” mockups as if they were the app.
Use real captures of the launcher/settings when ready (Linear G3-01).
