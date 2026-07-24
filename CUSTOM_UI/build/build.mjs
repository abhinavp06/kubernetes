// Build pipeline: render the MVP docs (Pod / Deployment / Service) to static JSON,
// build the nav + search manifest, and resolve the code-map (doc -> Go definitions).
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import hljs from 'highlight.js';

import { DOCS_DIR, EXAMPLES_DIR, GLOSSARY_DIR, DATA_DIR, PAGES_DIR, K8S_VERSION, K8S_VERSION_SHORT } from '../config.mjs';
import { expandShortcodes, restorePlaceholders } from '../lib/shortcodes.mjs';
import { resolveSymbol } from '../lib/symbols.mjs';
import { CONCEPTS, PAGE_FILES } from '../lib/component-registry.mjs';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- markdown-it ----
const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

const slugifyHeading = (s) =>
  String(s).trim().toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

md.use(anchor, {
  slugify: slugifyHeading,
  permalink: anchor.permalink.linkInsideHeader({ symbol: '#', placement: 'after' }),
});

// Hugo/Goldmark explicit heading IDs: `## Heading {#custom-id}` (also strips `{.class}`).
// Runs after markdown-it-anchor so it overrides the auto slug with the authored id and
// repoints the permalink — otherwise the `{#id}` leaks as literal heading text.
md.core.ruler.push('custom_heading_ids', (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].type !== 'heading_open') continue;
    const inline = tokens[i + 1];
    if (!inline || inline.type !== 'inline' || !inline.children) continue;
    for (const child of inline.children) {
      if (child.type !== 'text') continue;
      const m = child.content.match(/\s*\{([#.][^}]*)\}\s*$/);
      if (!m) continue;
      child.content = child.content.slice(0, child.content.length - m[0].length).replace(/\s+$/, '');
      const idMatch = m[1].match(/#([\w-]+)/);
      if (idMatch) {
        tokens[i].attrSet('id', idMatch[1]);
        for (const c of inline.children) {
          if (c.type === 'link_open' && (c.attrGet('href') || '').startsWith('#')) c.attrSet('href', '#' + idMatch[1]);
        }
      }
      break;
    }
  }
});

// Custom fence renderer: language label + copy button + highlight.js output.
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const lang = (token.info || '').trim().split(/\s+/)[0] || 'text';
  const code = token.content;
  const highlighted =
    lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : esc(code);
  return (
    `<div class="code"><div class="code-head"><span class="code-lang">${esc(lang)}</span>` +
    `<button class="copy" data-copy>copy</button></div>` +
    `<pre><code class="hljs language-${esc(lang)}">${highlighted}</code></pre></div>`
  );
};

// Link rewriting: internal doc links -> hash routes; external -> new tab.
const defaultLinkOpen = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = token.attrGet('href') || '';
  if (/^https?:\/\//.test(href)) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener');
  } else if (href.startsWith('/docs/')) {
    token.attrSet('href', '#/' + href.replace(/^\/docs\//, '').replace(/\/+$/, ''));
  } else if (href.startsWith('/')) {
    token.attrSet('href', '#/' + href.replace(/^\/+/, '').replace(/\/+$/, ''));
  } else if (href && !href.startsWith('#') && !href.startsWith('mailto:')) {
    token.attrSet('href', '#/' + href.replace(/\/+$/, ''));
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// ---- frontmatter ----
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: raw };
  let data = {};
  try {
    data = yaml.load(m[1]) || {};
  } catch (e) {
    console.warn('[build] frontmatter parse failed:', e.message);
  }
  return { data, body: raw.slice(m[0].length) };
}

// ---- shortcode helpers ----
const EXT_LANG = { yaml: 'yaml', yml: 'yaml', json: 'json', sh: 'bash', go: 'go', py: 'python', txt: 'text' };

function readExample(file) {
  try {
    const content = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
    const ext = (file.split('.').pop() || 'text').toLowerCase();
    return { content, lang: EXT_LANG[ext] || ext || 'text' };
  } catch {
    return null;
  }
}

function readGlossaryDef(term, length, prepend) {
  try {
    const raw = fs.readFileSync(path.join(GLOSSARY_DIR, term + '.md'), 'utf8');
    const { data, body } = parseFrontmatter(raw);
    let def;
    if (length === 'short' && data.short_description) {
      def = String(data.short_description);
    } else {
      def = body.split('<!--more-->')[0].replace(/\{\{[^}]*\}\}/g, '').trim().split(/\n\s*\n/)[0];
    }
    def = def.replace(/\s+/g, ' ').trim();
    if (prepend) def = prepend.trim() + ' ' + def.charAt(0).toLowerCase() + def.slice(1);
    return def;
  } catch {
    return prepend || '';
  }
}

const renderInner = (mdText) => md.render(mdText);

// ---- TOC extraction ----
function extractToc(html) {
  const toc = [];
  const re = /<h([23])[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(html))) {
    const text = m[3].replace(/<[^>]+>/g, '').replace(/#\s*$/, '').trim();
    if (text) toc.push({ level: Number(m[1]), id: m[2], text });
  }
  return toc;
}

const slugFile = (slug) => slug.replace(/\//g, '__') + '.json';

// ---- render pages ----
fs.mkdirSync(PAGES_DIR, { recursive: true });
const pages = [];

for (const [slug, rel] of Object.entries(PAGE_FILES)) {
  const abs = path.join(DOCS_DIR, rel);
  const raw = fs.readFileSync(abs, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const { markdown, placeholders } = expandShortcodes(body, {
    version: K8S_VERSION_SHORT,
    readExample,
    readGlossaryDef,
    renderInner,
  });
  let html = md.render(markdown);
  html = restorePlaceholders(html, placeholders);
  const toc = extractToc(html);
  const section = slug.split('/')[0];
  const title = data.title || slug;
  const page = {
    slug,
    title,
    type: data.content_type || 'concept',
    section,
    api_metadata: data.api_metadata || null,
    hasCode: !!CONCEPTS[slug],
    html,
    toc,
  };
  fs.writeFileSync(path.join(PAGES_DIR, slugFile(slug)), JSON.stringify(page));
  pages.push({ slug, title, type: page.type, section, headings: toc.map((t) => t.text) });
  console.log(`[build] rendered ${slug} (${toc.length} headings)`);
}

// ---- nav (curated for the MVP slice) ----
const pageRef = (slug) => {
  const p = pages.find((x) => x.slug === slug);
  return { title: p ? p.title : slug, slug, type: 'page' };
};
const nav = [
  {
    title: 'Concepts',
    type: 'section',
    children: [
      {
        title: 'Workloads',
        type: 'group',
        children: [pageRef('concepts/workloads/pods'), pageRef('concepts/workloads/controllers/deployment')],
      },
      {
        title: 'Services & Networking',
        type: 'group',
        children: [pageRef('concepts/services-networking/service')],
      },
    ],
  },
];

// ---- code-map: resolve every target symbol to file:line ----
const codeMap = {};
let resolved = 0;
let missing = 0;
for (const [slug, def] of Object.entries(CONCEPTS)) {
  const tiers = def.tiers.map((t) => ({
    tier: t.tier,
    label: t.label,
    targets: t.targets.map((tg) => {
      const r = resolveSymbol(tg.path, tg.pattern);
      if (r) resolved++;
      else missing++;
      return {
        role: tg.role,
        path: tg.path,
        lang: tg.lang || 'go',
        symbol: r ? r.text : null,
        line: r ? r.line : null,
        resolved: !!r,
      };
    }),
  }));
  codeMap[slug] = {
    kind: def.kind,
    apiVersion: def.apiVersion,
    group: def.group,
    title: def.title,
    blurb: def.blurb,
    tiers,
  };
}

// ---- manifest ----
const manifest = {
  version: K8S_VERSION,
  generatedAt: new Date().toISOString(),
  nav,
  slugs: pages.map((p) => p.slug),
  search: pages,
  concepts: Object.keys(CONCEPTS),
};

fs.writeFileSync(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest));
fs.writeFileSync(path.join(DATA_DIR, 'code-map.json'), JSON.stringify(codeMap));

console.log(`[build] pages: ${pages.length}  |  code-map symbols: ${resolved} resolved, ${missing} missing`);
if (missing > 0) console.warn('[build] WARNING: some symbols did not resolve — check patterns above.');
console.log('[build] done -> data/');
