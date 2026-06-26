// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// TODO: change this to your real domain once registered (used for canonical
// URLs, the sitemap, Open Graph tags, and the absolute links in llms.txt).
// Keep it in sync with SITE in scripts/sync-docs.mjs.
const SITE = 'https://orlop.dev';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // Starlight emits a sitemap automatically because `site` is set.
  integrations: [
    starlight({
      title: 'orlop',
      description:
        'A zero-trust file plane that gives each untrusted agent its own durable, per-tenant POSIX disk — without ever handing it a storage credential.',
      tagline:
        'Durable per-tenant POSIX disks for untrusted agent sandboxes.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/liu1700/orlop',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/liu1700/orlop/edit/main/',
      },
      // Surface the agent-facing artifacts in <head> so crawlers/agents find them.
      head: [
        {
          tag: 'link',
          attrs: { rel: 'alternate', type: 'text/plain', href: '/llms.txt', title: 'llms.txt' },
        },
      ],
      sidebar: [
        {
          label: 'Overview',
          items: [
            { label: 'What is orlop?', slug: 'what-is-orlop' },
            { label: 'FAQ', slug: 'faq' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Quickstart (single node)', slug: 'reference/standalone-quickstart' },
            { label: 'Agent memory', slug: 'reference/agent-memory' },
          ],
        },
        {
          label: 'Design & reference',
          items: [{ autogenerate: { directory: 'reference' } }],
        },
      ],
    }),
  ],
});
