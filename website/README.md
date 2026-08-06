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
| `robots.txt` / `sitemap.xml` | SEO |

## Deploy

**Cloudflare Workers** (static assets), account rbakman@gmail.com, worker `clutterdock-site`:

```bash
cd ~/Developer/ClutterDock
npx wrangler@latest deploy
```

Config is [`wrangler.toml`](../wrangler.toml) at the repo root; the worker script
[`scripts/site-worker.mjs`](../scripts/site-worker.mjs) serves this directory and
301-redirects every non-canonical host to **https://clutterdock.com**.

Custom domains (DNS records auto-managed by Cloudflare):

| Host | Behavior |
|------|----------|
| `clutterdock.com` | canonical — serves the site |
| `www.clutterdock.com` | 301 → clutterdock.com |
| `clutterdock.app` | 301 → clutterdock.com |
| `www.clutterdock.app` | 301 → clutterdock.com |

Deploys are manual (`wrangler login` as rbakman@gmail.com required). If you want
auto-deploy on push later, add a `CLOUDFLARE_API_TOKEN` repo secret and a workflow
that runs `wrangler deploy`.

## Content source of truth

Pricing numbers and Free/Pro limits come from [`docs/PRICING.md`](../docs/PRICING.md).

## Placeholders still manual

1. **Checkout** — wire “Unlock Pro” / “Get Pro Multi” to Lemon Squeezy, Gumroad, or Paddle.

Do not publish license generator secrets on this site.

## Product screenshots

Do **not** use generated “before/after Dock” mockups as if they were the app.
Use real captures of the launcher/settings when ready (Linear G3-01).
