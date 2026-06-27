// Single source of truth: the canonical reference docs live in the orlop repo
// under docs/ (https://github.com/liu1700/orlop/tree/main/docs). This script
// pulls them in at build time — fetched from GitHub by default, or from a local
// checkout if ORLOP_DOCS_DIR (or a sibling ../docs) is present — adds the
// frontmatter Starlight needs, and generates the agent-facing /llms.txt and
// /llms-full.txt. All outputs are git-ignored; never edit them by hand.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REF_DIR = path.join(ROOT, 'src', 'content', 'docs', 'reference');
const AUTHORED_DIR = path.join(ROOT, 'src', 'content', 'docs');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Keep `site` in astro.config.mjs in sync with this.
const SITE = 'https://orlop.dev';
const REPO = 'liu1700/orlop';
const BRANCH = 'main';
const REPO_BLOB = `https://github.com/${REPO}/blob/${BRANCH}`;

// One-line product summary, reused across llms.txt and the per-page Markdown
// representations served for `Accept: text/markdown` (worker/index.js).
const TAGLINE =
  'orlop is a multi-tenant, zero-trust file plane for agent sandboxes. Each ' +
  'agent gets its own durable, auto-expanding POSIX disk mounted over FUSE; ' +
  'the bytes live in a remote content-addressed chunk store and the agent ' +
  'never sees a storage credential.';

// Authored pages (plain Markdown, no JSX) that also feed llms-full.txt and the
// per-page Markdown variants.
const AUTHORED_SLUGS = ['what-is-orlop', 'faq'];

// Curated order + section for the reference docs (anything not listed still
// gets published, just appended at the end). Doubles as the offline fallback
// list if the GitHub contents API can't be reached.
const ORDER = [
  'standalone-quickstart',
  'database-backends',
  'agent-memory',
  'design',
  'design-data-plane',
  'design-auth',
  'design-identity',
  'control-plane',
  'control-plane-runbook',
  'audit-events',
];

// --- doc sources -----------------------------------------------------------

async function listLocal(dir) {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'));
  return Promise.all(
    files.map(async (f) => ({
      slug: f.replace(/\.md$/, ''),
      raw: await fs.readFile(path.join(dir, f), 'utf8'),
    }))
  );
}

async function listRemote() {
  let names = ORDER;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/contents/docs?ref=${BRANCH}`,
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'orlop-www-build' } }
    );
    if (res.ok) {
      const json = await res.json();
      names = json.filter((e) => e.name?.endsWith('.md')).map((e) => e.name.replace(/\.md$/, ''));
    } else {
      console.warn(`sync:docs — GitHub contents API ${res.status}, using built-in doc list.`);
    }
  } catch (e) {
    console.warn(`sync:docs — GitHub contents API unreachable (${e.message}), using built-in doc list.`);
  }
  return Promise.all(
    names.map(async (slug) => {
      const r = await fetch(
        `https://raw.githubusercontent.com/${REPO}/${BRANCH}/docs/${slug}.md`,
        { headers: { 'User-Agent': 'orlop-www-build' } }
      );
      if (!r.ok) throw new Error(`fetch docs/${slug}.md -> HTTP ${r.status}`);
      return { slug, raw: await r.text() };
    })
  );
}

// Guard against silently building from the wrong local directory. The local
// fallbacks below are a convenience for offline dev, but a same-named sibling
// `../docs` belonging to an unrelated project would otherwise be used without
// warning — this has actually happened, publishing another repo's API reference.
// Require the directory to look like the orlop docs: at least one Markdown file
// that mentions the project by name. Content-based, so it survives file renames.
async function looksLikeOrlopDocs(dir) {
  let files;
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'));
  } catch {
    return false; // missing or unreadable
  }
  if (files.length === 0) return false;
  for (const f of files) {
    const text = await fs.readFile(path.join(dir, f), 'utf8');
    if (/\borlop\b/i.test(text)) return true;
  }
  return false;
}

async function loadRaw() {
  // Explicit override: trust the path the operator pointed at, but fail loudly
  // if it isn't the orlop docs rather than building someone else's content.
  const explicit = process.env.ORLOP_DOCS_DIR;
  if (explicit) {
    if (await looksLikeOrlopDocs(explicit)) {
      console.log(`sync:docs — using local docs at ${explicit}`);
      return listLocal(explicit);
    }
    throw new Error(
      `ORLOP_DOCS_DIR=${explicit} doesn't look like the orlop docs ` +
        `(no .md file mentions "orlop"). Point it at <orlop>/docs, or unset it to fetch from GitHub.`
    );
  }

  // Implicit sibling fallback: use it only if it really is the orlop docs;
  // otherwise warn and fetch from GitHub rather than silently using the wrong dir.
  const sibling = path.resolve(ROOT, '..', 'docs');
  if (await looksLikeOrlopDocs(sibling)) {
    console.log(`sync:docs — using local docs at ${sibling}`);
    return listLocal(sibling);
  }
  let siblingExists = true;
  try {
    await fs.access(sibling);
  } catch {
    siblingExists = false;
  }
  if (siblingExists) {
    console.warn(
      `sync:docs — ignoring ${sibling}: doesn't look like the orlop docs ` +
        `(no .md file mentions "orlop"). Set ORLOP_DOCS_DIR to use a local copy.`
    );
  }

  console.log(`sync:docs — fetching docs from github.com/${REPO}@${BRANCH}`);
  return listRemote();
}

// --- transforms ------------------------------------------------------------

function truncate(s, max = 155) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:\s]+$/, '') + '…';
}

const stripMd = (s) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> text
    .replace(/[`*_>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function firstParagraph(body) {
  for (const block of body.split(/\n\s*\n/)) {
    const t = block.trim();
    if (t && !t.startsWith('#') && !t.startsWith('```') && !t.startsWith('|')) {
      return t;
    }
  }
  return '';
}

function rewriteLinks(body, docBasenames) {
  return body.replace(/\]\(([^)]+?)\.md(#[^)]*)?\)/g, (m, p, anchor = '') => {
    const base = p.split('/').pop();
    if (docBasenames.has(base)) return `](/reference/${base}/${anchor})`;
    if (/^(README|CONTRIBUTING|SECURITY)$/.test(base)) {
      return `](${REPO_BLOB}/${base}.md${anchor})`;
    }
    return m;
  });
}

async function readDocs() {
  const rawDocs = await loadRaw();
  const basenames = new Set(rawDocs.map((d) => d.slug));
  const docs = rawDocs.map(({ slug, raw }) => {
    const lines = raw.split('\n');
    const h1 = lines.findIndex((l) => /^#\s+/.test(l));
    const title = h1 >= 0 ? stripMd(lines[h1].replace(/^#\s+/, '')) : slug;
    const body = (h1 >= 0 ? lines.slice(h1 + 1).join('\n') : raw).trim();
    const description = truncate(stripMd(firstParagraph(body)));
    return { slug, title, description, body: rewriteLinks(body, basenames) };
  });
  const rank = (s) => {
    const i = ORDER.indexOf(s);
    return i === -1 ? ORDER.length : i;
  };
  docs.sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug));
  return docs;
}

// --- outputs ---------------------------------------------------------------

const yamlEscape = (s) => s.replace(/"/g, '\\"');

async function writeReference(docs) {
  await fs.rm(REF_DIR, { recursive: true, force: true });
  await fs.mkdir(REF_DIR, { recursive: true });
  docs.forEach((d, i) => (d.order = i));
  for (const d of docs) {
    const fm =
      `---\n` +
      `title: "${yamlEscape(d.title)}"\n` +
      (d.description ? `description: "${yamlEscape(d.description)}"\n` : '') +
      `sidebar:\n  order: ${d.order}\n` +
      `---\n\n`;
    await fs.writeFile(path.join(REF_DIR, `${d.slug}.md`), fm + d.body + '\n');
  }
}

async function readAuthored(slug) {
  // Pull plain-markdown authored pages (skips index.mdx, which has JSX) so the
  // overview content is part of llms-full.txt too.
  try {
    const raw = await fs.readFile(path.join(AUTHORED_DIR, `${slug}.md`), 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const fmTitle = m && m[1].match(/title:\s*"?([^"\n]+)"?/);
    return { title: fmTitle ? fmTitle[1] : slug, body: (m ? m[2] : raw).trim() };
  } catch {
    return null;
  }
}

async function writeLlms(docs, overview) {
  await fs.mkdir(PUBLIC_DIR, { recursive: true });

  // llms.txt — a curated map for agents/LLMs (https://llmstxt.org/).
  let llms = `# orlop\n\n> ${TAGLINE}\n\n`;
  llms += `## Overview\n`;
  for (const a of overview) llms += `- [${a.title}](${a.url})\n`;
  llms += `\n## Design & reference\n`;
  for (const d of docs) {
    llms += `- [${d.title}](${SITE}/reference/${d.slug}/)`;
    llms += d.description ? `: ${d.description}\n` : `\n`;
  }
  llms += `\n## Source\n- [GitHub repository](https://github.com/${REPO})\n`;
  await fs.writeFile(path.join(PUBLIC_DIR, 'llms.txt'), llms);

  // llms-full.txt — the whole corpus inlined for one-shot retrieval.
  let full = `# orlop full documentation\n\n> ${TAGLINE}\n\n`;
  for (const a of overview) full += `\n\n# ${a.title}\n\n${a.body}\n`;
  for (const d of docs) full += `\n\n# ${d.title}\n\n${d.body}\n`;
  await fs.writeFile(path.join(PUBLIC_DIR, 'llms-full.txt'), full);
}

// Per-page Markdown representations. worker/index.js serves these when
// a client sends `Accept: text/markdown`, mirroring the site's routes:
//   /                  -> public/index.md
//   /<slug>/           -> public/<slug>.md
//   /reference/<slug>/ -> public/reference/<slug>.md
// All files are git-ignored build artifacts, like the llms.txt outputs.
async function writeMarkdownPages(docs, overview) {
  // Regenerate from scratch so stale per-page variants (e.g. left over from a
  // previous build with a different doc set) don't linger and get published.
  const refDir = path.join(PUBLIC_DIR, 'reference');
  await fs.rm(refDir, { recursive: true, force: true });
  await fs.mkdir(refDir, { recursive: true });

  // Landing page: index.mdx is JSX, so synthesize a concise Markdown view.
  let index = `# orlop\n\n> ${TAGLINE}\n\n## Overview\n`;
  for (const a of overview) index += `- [${a.title}](/${a.slug}/)\n`;
  index += `\n## Design & reference\n`;
  for (const d of docs) {
    index += `- [${d.title}](/reference/${d.slug}/)`;
    index += d.description ? `: ${d.description}\n` : `\n`;
  }
  index += `\n## Source\n- [GitHub repository](https://github.com/${REPO})\n`;
  await fs.writeFile(path.join(PUBLIC_DIR, 'index.md'), index);

  // Authored content pages.
  for (const a of overview) {
    await fs.writeFile(
      path.join(PUBLIC_DIR, `${a.slug}.md`),
      `# ${a.title}\n\n${a.body}\n`
    );
  }

  // Reference pages (bodies already have site-relative links from rewriteLinks).
  for (const d of docs) {
    await fs.writeFile(
      path.join(PUBLIC_DIR, 'reference', `${d.slug}.md`),
      `# ${d.title}\n\n${d.body}\n`
    );
  }
}

const docs = await readDocs();
await writeReference(docs);

const overview = [];
for (const slug of AUTHORED_SLUGS) {
  const a = await readAuthored(slug);
  if (a) overview.push({ slug, ...a, url: `${SITE}/${slug}/` });
}

await writeLlms(docs, overview);
await writeMarkdownPages(docs, overview);
console.log(
  `sync:docs — ${docs.length} reference pages + llms.txt + llms-full.txt + ` +
    `${docs.length + overview.length + 1} markdown page variants generated.`
);
