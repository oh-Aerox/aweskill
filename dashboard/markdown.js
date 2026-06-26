/**
 * Minimal markdown renderer for trusted local README content.
 * Preserves embedded HTML blocks and fenced code before line processing.
 */

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInline(text) {
  let output = escapeHtml(text);
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
  return output;
}

function renderTableBlock(lines) {
  const rows = lines.filter((line) => line.trim().startsWith("|"));
  if (rows.length < 2) {
    return `<p>${formatInline(lines.join("\n"))}</p>`;
  }

  const parseRow = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const headerCells = parseRow(rows[0]);
  const bodyRows = rows.slice(2).map(parseRow);

  const thead = `<thead><tr>${headerCells.map((cell) => `<th>${formatInline(cell)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${bodyRows
    .map((cells) => `<tr>${cells.map((cell) => `<td>${formatInline(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;

  return `<table class="markdown-table">${thead}${tbody}</table>`;
}

function renderMarkdownBlock(block) {
  const lines = block.split("\n");
  const trimmed = block.trim();

  if (!trimmed) {
    return "";
  }

  if (/^#{1,6}\s/.test(trimmed)) {
    const match = /^(#{1,6})\s+(.*)$/.exec(lines[0]);
    if (match) {
      const level = match[1].length;
      return `<h${level}>${formatInline(match[2])}</h${level}>`;
    }
  }

  if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
    return "<hr />";
  }

  if (/^>\s?/.test(lines[0])) {
    const quote = lines.map((line) => line.replace(/^>\s?/, "")).join("\n");
    return `<blockquote>${renderMarkdown(quote)}</blockquote>`;
  }

  if (lines.every((line) => /^\s*[-*+]\s+/.test(line))) {
    const items = lines.map((line) => line.replace(/^\s*[-*+]\s+/, ""));
    return `<ul>${items.map((item) => `<li>${formatInline(item)}</li>`).join("")}</ul>`;
  }

  if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
    const items = lines.map((line) => line.replace(/^\s*\d+\.\s+/, ""));
    return `<ol>${items.map((item) => `<li>${formatInline(item)}</li>`).join("")}</ol>`;
  }

  if (lines.some((line) => line.trim().startsWith("|"))) {
    return renderTableBlock(lines);
  }

  return `<p>${lines.map((line) => formatInline(line)).join("<br />")}</p>`;
}

function stashProtectedBlocks(source, stash) {
  let text = source;

  text = text.replace(/```[\s\S]*?```/g, (match) => {
    const id = stash.length;
    stash.push(match);
    return `\x00STASH${id}\x00`;
  });

  const htmlPatterns = [
    /<details[\s\S]*?<\/details>/gi,
    /<div[\s\S]*?<\/div>/gi,
    /<table[\s\S]*?<\/table>/gi,
  ];

  for (const pattern of htmlPatterns) {
    text = text.replace(pattern, (match) => {
      const id = stash.length;
      stash.push(match);
      return `\x00STASH${id}\x00`;
    });
  }

  return text;
}

function restoreProtectedBlocks(html, stash) {
  return html.replace(/\x00STASH(\d+)\x00/g, (_match, index) => stash[Number(index)] ?? "");
}

function renderFencedCode(block) {
  const match = /^```(\w*)\n?([\s\S]*?)```$/m.exec(block.trim());
  if (!match) {
    return `<pre class="code-block">${escapeHtml(block)}</pre>`;
  }

  const language = match[1] ? ` language-${match[1]}` : "";
  return `<pre class="code-block${language}"><code>${escapeHtml(match[2].trimEnd())}</code></pre>`;
}

function renderMarkdown(source) {
  const stash = [];
  const protectedSource = stashProtectedBlocks(source, stash);
  const blocks = protectedSource.split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const tokenMatch = /^\x00STASH(\d+)\x00$/.exec(block.trim());
      if (tokenMatch) {
        const stashed = stash[Number(tokenMatch[1])] ?? "";
        if (stashed.startsWith("```")) {
          return renderFencedCode(stashed);
        }
        return stashed;
      }

      if (block.trim().startsWith("<")) {
        return block.trim();
      }

      return renderMarkdownBlock(block);
    })
    .filter(Boolean)
    .join("\n");

  return restoreProtectedBlocks(html, stash);
}

window.renderMarkdown = renderMarkdown;
