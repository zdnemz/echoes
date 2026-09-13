/**
 * Bidirectional markdown <-> HTML for the contenteditable WYSIWYG editor.
 *
 * md -> HTML: renders markdown to clean semantic HTML (used when loading
 *   an entry or importing a file into the editor).
 * HTML -> md: serializes the editor's DOM back to markdown (used on every
 *   save and for export).
 *
 * Intentionally kept dependency-free — the supported subset (headings,
 * bold, italic, strikethrough, links, lists, blockquotes, code, hr) covers
 * what the toolbar offers and what journal entries actually use.
 */

// ---------------------------------------------------------------- md -> html

/** Convert a markdown string to semantic HTML safe for contenteditable. */
export function mdToHtml(md: string): string {
  if (!md.trim()) return '<p><br></p>'

  let html = ''
  const lines = md.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(esc(lines[i]))
        i++
      }
      i++ // skip closing ```
      html += `<pre data-lang="${esc(lang)}"><code>${codeLines.join('\n')}</code></pre>`
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html += '<hr>'
      i++
      continue
    }

    // Heading
    const hMatch = line.match(/^(#{1,3})\s+(.*)$/)
    if (hMatch) {
      const level = hMatch[1].length
      html += `<h${level}>${inline(hMatch[2])}</h${level}>`
      i++
      continue
    }

    // Blockquote (collect consecutive > lines)
    if (line.startsWith('> ') || line === '>') {
      const qLines: string[] = []
      while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
        qLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      html += `<blockquote>${qLines.map((l) => `<p>${inline(l) || '<br>'}</p>`).join('')}</blockquote>`
      continue
    }

    // Unordered list (- or * or checklist)
    if (/^[-*]\s/.test(line)) {
      html += parseList(lines, i, 'ul')
      while (i < lines.length && /^[-*]\s/.test(lines[i])) i++
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      html += parseList(lines, i, 'ol')
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) i++
      continue
    }

    // Empty line
    if (!line.trim()) {
      i++
      continue
    }

    // Paragraph (collect consecutive non-empty, non-block lines)
    const pLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^[-*]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !lines[i].startsWith('> ') &&
      !lines[i].startsWith('```') &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      pLines.push(inline(lines[i]))
      i++
    }
    html += `<p>${pLines.join('<br>')}</p>`
  }

  return html || '<p><br></p>'
}

function parseList(lines: string[], start: number, tag: 'ul' | 'ol'): string {
  const items: string[] = []
  const prefix = tag === 'ol' ? /^\d+\.\s/ : /^[-*]\s/
  let i = start
  while (i < lines.length && prefix.test(lines[i])) {
    let content = lines[i].replace(prefix, '')

    // Checklist item
    const checkMatch = content.match(/^\[([x ])\]\s?(.*)$/i)
    if (checkMatch) {
      const checked = checkMatch[1].toLowerCase() === 'x'
      items.push(
        `<li data-checked="${checked}"><input type="checkbox" ${checked ? 'checked' : ''} disabled>${inline(checkMatch[2])}</li>`,
      )
    } else {
      items.push(`<li>${inline(content)}</li>`)
    }
    i++
  }
  return `<${tag}>${items.join('')}</${tag}>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Inline markdown -> HTML (bold, italic, strikethrough, code, links, images). */
function inline(text: string): string {
  let s = esc(text)
  // Inline code (must come first to protect inner content)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Images (before links — same bracket syntax)
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
  // Links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  // Bold+italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  // Bold
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Strikethrough
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>')
  return s
}

// ---------------------------------------------------------------- html -> md

/** Serialize the editor's innerHTML back to markdown. */
export function htmlToMd(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return nodesToMd(div.childNodes).trim()
}

function nodesToMd(nodes: NodeListOf<ChildNode>): string {
  let md = ''
  for (const node of nodes) {
    md += nodeToMd(node)
  }
  return md
}

function nodeToMd(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const inner = () => nodesToMd(el.childNodes)

  switch (tag) {
    case 'p':
      return inner().trim() + '\n\n'
    case 'br':
      return '\n'
    case 'h1':
      return `# ${inner().trim()}\n\n`
    case 'h2':
      return `## ${inner().trim()}\n\n`
    case 'h3':
      return `### ${inner().trim()}\n\n`
    case 'strong':
    case 'b':
      return `**${inner()}**`
    case 'em':
    case 'i':
      return `*${inner()}*`
    case 'del':
    case 's':
      return `~~${inner()}~~`
    case 'code':
      if (el.parentElement?.tagName.toLowerCase() === 'pre') return inner()
      return `\`${inner()}\``
    case 'pre': {
      const lang = el.getAttribute('data-lang') || ''
      const code = el.querySelector('code')?.textContent ?? el.textContent ?? ''
      return `\`\`\`${lang}\n${code.replace(/\n$/, '')}\n\`\`\`\n\n`
    }
    case 'a': {
      const href = el.getAttribute('href') ?? ''
      return `[${inner()}](${href})`
    }
    case 'img': {
      const src = el.getAttribute('src') ?? ''
      const alt = el.getAttribute('alt') ?? ''
      return `![${alt}](${src})`
    }
    case 'blockquote':
      return (
        inner()
          .trim()
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n') + '\n\n'
      )
    case 'ul':
      return (
        Array.from(el.children)
          .map((li) => {
            const checked = li.getAttribute('data-checked')
            if (checked !== null) {
              const text = nodesToMd(li.childNodes).replace(/^\s*/, '').trim()
              return `- [${checked === 'true' ? 'x' : ' '}] ${text}`
            }
            return `- ${nodesToMd(li.childNodes).trim()}`
          })
          .join('\n') + '\n\n'
      )
    case 'ol':
      return (
        Array.from(el.children)
          .map((li, i) => `${i + 1}. ${nodesToMd(li.childNodes).trim()}`)
          .join('\n') + '\n\n'
      )
    case 'li':
      return inner()
    case 'hr':
      return '---\n\n'
    case 'div':
      // Browser sometimes wraps lines in divs inside contenteditable
      return inner().trim() + '\n'
    case 'input':
      return '' // checkbox inputs are handled by the li parent
    default:
      return inner()
  }
}
