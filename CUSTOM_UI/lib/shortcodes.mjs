// Rewrite Hugo/Docsy shortcodes into clean markdown/HTML *before* markdown-it runs.
//
// Two kinds of output:
//   - inline shortcodes  -> HTML spans (markdown-it runs with html:true, so they pass through)
//   - block shortcodes    -> either injected markdown (code fences, headings, tab labels) or
//                            an opaque placeholder whose pre-rendered HTML is restored afterward
//                            (callouts/figures, whose bodies are already-rendered HTML blocks).
//
// Anything we don't recognise is stripped cleanly so no raw `{{< … >}}` leaks into the page.

const CALLOUT_LABEL = { note: 'Note', caution: 'Caution', warning: 'Warning', tip: 'Tip', info: 'Info' };
const HEADINGS = {
  whatsnext: "What's next",
  prerequisites: 'Before you begin',
  objectives: 'Objectives',
  cleanup: 'Cleaning up',
  synopsis: 'Synopsis',
  examples: 'Examples',
  options: 'Options',
  editthispage: 'Feedback',
};

const EXT_LANG = { yaml: 'yaml', yml: 'yaml', json: 'json', sh: 'bash', bash: 'bash', go: 'go', py: 'python', txt: 'text' };

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attr(attrs, name) {
  const m =
    attrs.match(new RegExp(name + '\\s*=\\s*"([^"]*)"')) ||
    attrs.match(new RegExp(name + "\\s*=\\s*'([^']*)'"));
  return m ? m[1] : null;
}

function dedent(s) {
  const lines = s.replace(/^\n+/, '').replace(/\s+$/, '').split('\n');
  let min = Infinity;
  for (const l of lines) {
    if (!l.trim()) continue;
    const lead = l.match(/^[ \t]*/)[0].length;
    if (lead < min) min = lead;
  }
  if (!isFinite(min)) min = 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

function headingLabel(name) {
  return HEADINGS[name] || name.charAt(0).toUpperCase() + name.slice(1);
}

function calloutHTML(kind, innerHtml) {
  const label = CALLOUT_LABEL[kind] || kind;
  return (
    `<div class="callout callout-${kind}">` +
    `<div class="callout-label">${label}</div>` +
    `<div class="callout-body">${innerHtml}</div>` +
    `</div>`
  );
}

// helpers: { version, readExample(file)->{content,lang}|null, readGlossaryDef(term,length,prepend)->str, renderInner(md)->html }
export function expandShortcodes(raw, helpers) {
  const { version, readExample, readGlossaryDef, renderInner } = helpers;
  const placeholders = new Map();
  let counter = 0;
  const stash = (html) => {
    const key = `@@SC${counter++}@@`;
    placeholders.set(key, html);
    return key;
  };

  let s = raw;

  // ---- inline shortcodes -> HTML ----
  s = s.replace(/\{\{<\s*glossary_tooltip\s+([^>]*?)>\}\}/g, (_, a) => {
    const term = attr(a, 'term_id') || '';
    const text = attr(a, 'text') || term;
    return `<span class="term" data-term="${esc(term)}">${esc(text)}</span>`;
  });
  s = s.replace(/\{\{<\s*feature-state\s+([^>]*?)>\}\}/g, (_, a) => {
    const v = attr(a, 'for_k8s_version') || '';
    const st = attr(a, 'state') || '';
    return `<span class="feature-state">FEATURE STATE <code>${esc(v)}</code> ${esc(st)}</span>`;
  });
  s = s.replace(/\{\{[<%]\s*param\s+"?version"?\s*[%>]\}\}/g, esc(version));
  s = s.replace(/\{\{<\s*skew\s+\w+\s*>\}\}/g, esc(version));
  s = s.replace(/\{\{<\s*latest-version\s*>\}\}/g, esc(version));
  s = s.replace(/\{\{<\s*api-reference\s+([^>]*?)>\}\}/g, (_, a) => {
    const page = attr(a, 'page') || '';
    return `<span class="api-ref">API reference · <code>${esc(page)}</code></span>`;
  });
  s = s.replace(/\{\{<\s*glossary_definition\s+([^>]*?)>\}\}/g, (_, a) => {
    const term = attr(a, 'term_id') || '';
    const length = attr(a, 'length') || 'short';
    const prepend = attr(a, 'prepend') || '';
    return esc(readGlossaryDef(term, length, prepend));
  });

  // ---- heading shortcode -> markdown h2 ----
  s = s.replace(/\{\{%\s*heading\s+"?(\w+)"?\s*%\}\}/g, (_, name) => `\n\n## ${headingLabel(name)}\n\n`);

  // ---- code_sample / code -> fenced code (custom fence renderer picks it up) ----
  s = s.replace(/\{\{[<%]\s*code(?:_sample)?\s+([^%>]*?)\s*[%>]\}\}/g, (_, a) => {
    const file = attr(a, 'file');
    if (!file) return '';
    const sample = readExample(file);
    if (!sample) return `\n\n> _example not found: ${esc(file)}_\n\n`;
    const ext = (file.split('.').pop() || 'text').toLowerCase();
    const lang = sample.lang || EXT_LANG[ext] || 'text';
    return `\n\n\`\`\`${lang}\n${sample.content.replace(/\n+$/, '')}\n\`\`\`\n\n`;
  });

  // ---- figure -> html block ----
  s = s.replace(/\{\{<\s*figure\s+([^>]*?)>\}\}/g, (_, a) => {
    const src = attr(a, 'src') || '';
    const alt = attr(a, 'alt') || '';
    const url = src.startsWith('/') ? `/static${src}` : src;
    return (
      '\n\n' +
      stash(
        `<figure class="figure"><img src="${esc(url)}" alt="${esc(alt)}" loading="lazy">` +
          (alt ? `<figcaption>${esc(alt)}</figcaption>` : '') +
          `</figure>`,
      ) +
      '\n\n'
    );
  });

  // ---- tabs / tab -> labeled blocks ----
  s = s.replace(/\{\{<\s*tabs\b[^>]*>\}\}/g, '');
  s = s.replace(/\{\{<\s*\/tabs\s*>\}\}/g, '');
  s = s.replace(/\{\{[<%]\s*tab\s+name="([^"]*)"[^%>]*[%>]\}\}([\s\S]*?)\{\{[<%]\s*\/tab\s*[%>]\}\}/g,
    (_, name, inner) => `\n\n**${name}**\n\n${dedent(inner).trim()}\n\n`);

  // ---- callouts (paired) -> stashed pre-rendered HTML ----
  s = s.replace(/\{\{[<%]\s*(note|caution|warning|tip|info)\s*[%>]\}\}([\s\S]*?)\{\{[<%]\s*\/\1\s*[%>]\}\}/g,
    (_, kind, inner) => '\n\n' + stash(calloutHTML(kind, renderInner(dedent(inner).trim()))) + '\n\n');

  // ---- strip any leftover shortcodes cleanly ----
  s = s.replace(/\{\{[<%]\s*\/?[a-zA-Z0-9_-]+[^}]*?[%>]\}\}/g, '');

  return { markdown: s, placeholders };
}

export function restorePlaceholders(html, placeholders) {
  let out = html;
  // two passes so a placeholder nested inside another (e.g. a figure inside a note) resolves
  for (let pass = 0; pass < 2; pass++) {
    for (const [key, val] of placeholders) {
      out = out.split(`<p>${key}</p>`).join(val).split(key).join(val);
    }
  }
  return out;
}
