# ClutterDock website

Static marketing + pricing site for **https://clutterdock.com** (also **clutterdock.app**).

## Preview locally

```bash
node scripts/preview-site.mjs
# open http://127.0.0.1:5307/ (PORT can override the port)
```

Run from the repository root with Node 20+. The local preview uses the production
Worker's download redirects and serves the local HTML/assets, including extensionless
pages and the custom 404. It binds only to localhost, accepts GET/HEAD, and has no
analytics binding, secrets, or live licensing connection.

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Product landing + install tips |
| `pricing.html` | Plans, comparison, FAQ, download |
| `privacy.html` | Privacy policy |
| `demo.html` | Prism feature film and real Mac/Windows screenshot gallery |
| `css/styles.css` | Base components and accessibility styles |
| `css/prism.css` | Shared light Prism theme and product-page layouts |
| `js/prism.js` | Screenshot gallery and film playback controls |
| `assets/` | App icon, feature film, captions, poster and real product screenshots |
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

The `site-deploy.yml` workflow exists but requires a valid `CLOUDFLARE_API_TOKEN`
repository secret. Manual deployment requires a valid Cloudflare login. A local
preview or merged website change alone does not confirm publication.

## Content source of truth

Pricing numbers and Free/Pro limits come from [`docs/PRICING.md`](../docs/PRICING.md).

## Placeholders still manual

1. **Checkout** — the Lemon Squeezy products remain drafts. Enable checkout links
   in `js/checkout-config.js` only after the licensing backend and receipt flow are
   verified. Empty URLs show an honest opening-soon state.

Do not publish license generator secrets on this site.

## Product screenshots

Do **not** use generated “before/after Dock” mockups as if they were the app.
Use real captures of the launcher/settings when ready (Linear G3-01).

### Prism website refresh (RON-442)

`prism-launcher-dark.png` is a real 960×560 capture of the installed Mac Prism
preview (1.4.10 build 16). It represents the Prism interface shipped in 1.4.11;
it is not evidence that the installed app itself was updated to that release.
The Windows light/dark WebP images are existing repository captures, not new
Windows release verification. Current Settings screenshots remain follow-up work
within RON-442. The old embedded demo video and old Mac screenshots are no longer
referenced by the public pages. The replacement 32-second feature film is tracked
in RON-504 and documented in [`docs/campaign/feature-film/README.md`](../docs/campaign/feature-film/README.md).
It animates authentic Prism captures with an original score and the proposed CD
Signature identity. The continuous interaction recording remains separate work.

Design direction: generous space, clear typography, restrained blue accents,
real product imagery, concise features, and straightforward download/pricing
sections, inspired by Ronald's Vitals reference. ClutterDock retains its own
branding and feature claims.

## Launch polish checklist

- [x] Why / how / who story on home
- [x] Public downloads (Mac zip + Windows exe on GitHub Releases)
- [x] Accessibility: skip link, focus styles, mobile nav
- [x] SEO: meta, OG, canonical, sitemap, schema
- [x] Custom domain DNS + HTTPS (Cloudflare Workers, both domains, .app + www → 301 clutterdock.com)
- [x] Real product screenshots (launcher + settings)
- [x] Enable public downloads after release
