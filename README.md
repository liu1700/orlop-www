# orlop website

Marketing + documentation site for [orlop](https://github.com/liu1700/orlop),
built with [Astro](https://astro.build) and
[Starlight](https://starlight.astro.build). Optimized for both traditional search
(clean static HTML, sitemap, per-page metadata) and agent/LLM search
(auto-generated [`/llms.txt`](https://llmstxt.org/) and `/llms-full.txt`).

This is a **separate repo** from the orlop codebase on purpose — it keeps the
Go/Rust core free of a Node toolchain and marketing copy. The deep reference docs
are **not** duplicated here.

## Single source of truth

`scripts/sync-docs.mjs` pulls the canonical Markdown from
[`liu1700/orlop` → `docs/`](https://github.com/liu1700/orlop/tree/main/docs) at
build time (adding the frontmatter Starlight needs) and generates the `llms.txt`
files. By default it **fetches from GitHub**; set `ORLOP_DOCS_DIR=/path/to/orlop/docs`
(or place an `orlop` checkout next to this repo so `../docs` resolves) to use a
local copy for offline development. The generated outputs are git-ignored —
**edit the originals in the orlop repo**, not the copies here.

Hand-authored pages that live only on the site:

- `src/content/docs/index.mdx` — landing page
- `src/content/docs/what-is-orlop.md` — overview / SEO anchor page
- `src/content/docs/faq.md` — FAQ

## Local development

```bash
npm install
npm run dev      # runs sync:docs, then starts the dev server at localhost:4321
npm run build    # production build into ./dist
npm run preview  # preview the production build
```

## Before going live

Register a domain, then set it in **two** places (kept intentionally in sync):

- `site` in [`astro.config.mjs`](astro.config.mjs)
- `SITE` in [`scripts/sync-docs.mjs`](scripts/sync-docs.mjs)

These drive canonical URLs, the sitemap, Open Graph tags, and the absolute links
inside `llms.txt`. Optionally add a `public/favicon.svg` and a social-card image.

## Deploy to Cloudflare Pages (free)

1. In Cloudflare Pages, **Create a project → Connect to Git** and pick this repo.
2. Build settings:
   - **Root directory:** *(leave blank — repo root)*
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. Add your custom domain in the Pages project once DNS is on Cloudflare.

The same settings work on Vercel or Netlify (build `npm run build`, output `dist`).
Because docs are fetched from GitHub at build time, **re-deploy this site whenever
the orlop docs change** (a deploy hook or a scheduled build keeps it fresh).
