'use client'

/**
 * Client-only MDXEditor boundary.
 *
 * MDXEditor (and some of its plugins) touch `document` at import time, so
 * this module must never evaluate during SSR — the entry editor loads it
 * through `next/dynamic` with `ssr: false`. The toolbar is ours (the same
 * fourteen buttons the markdown FormatBar had), rendered through the
 * toolbar plugin so the buttons live inside the editor realm and can
 * publish formatting signals. No toolbarPlugin styling survives: the Paper
 * & Ink overrides live in globals.css next to the other components.
 */

import { useEffect, useRef } from 'react'
import {
  MDXEditor,
  codeBlockPlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  applyFormat$,
  applyListType$,
  convertSelectionToNode$,
  currentBlockType$,
  currentListType$,
  insertCodeBlock$,
  insertThematicBreak$,
  openLinkEditDialog$,
  useCellValue,
  usePublisher,
  type MDXEditorMethods,
} from '@mdxeditor/editor'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { $createParagraphNode } from 'lexical'
import {
  Check,
  Code,
  CodeBlock,
  LinkSimple,
  ListBullets,
  ListChecks,
  ListNumbers,
  Minus,
  Quotes,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
} from '@phosphor-icons/react/dist/ssr'

// --------------------------------------------------------------- our toolbar

function JournalToolbar() {
  const applyFormat = usePublisher(applyFormat$)
  const convertBlock = usePublisher(convertSelectionToNode$)
  const currentBlock = useCellValue(currentBlockType$)
  const applyList = usePublisher(applyListType$)
  const currentList = useCellValue(currentListType$)
  const insertBreak = usePublisher(insertThematicBreak$)
  const insertCode = usePublisher(insertCodeBlock$)
  const openLink = usePublisher(openLinkEditDialog$)

  // Same toggle contract the markdown toolbar had: pressing the active
  // format again takes it back off (to paragraph / plain list-off).
  const toggleBlock = (kind: 'h1' | 'h2' | 'h3' | 'quote') => {
    if (currentBlock === kind) {
      convertBlock(() => $createParagraphNode())
      return
    }
    convertBlock(() => (kind === 'quote' ? $createQuoteNode() : $createHeadingNode(kind)))
  }
  const toggleList = (kind: 'bullet' | 'number' | 'check') => {
    applyList(currentList === kind ? '' : kind)
  }

  const buttons: Array<{
    label: string
    hint: string
    icon: React.ReactNode
    run: () => void
  }> = [
    { label: 'Bold', hint: 'Bold (⌘B)', icon: <TextB className="h-4 w-4" />, run: () => applyFormat('bold') },
    {
      label: 'Italic',
      hint: 'Italic (⌘I)',
      icon: <TextItalic className="h-4 w-4" />,
      run: () => applyFormat('italic'),
    },
    {
      label: 'Strikethrough',
      hint: 'Strikethrough',
      icon: <TextStrikethrough className="h-4 w-4" />,
      run: () => applyFormat('strikethrough'),
    },
    { label: 'Heading 1', hint: 'Heading 1', icon: <TextHOne className="h-4 w-4" />, run: () => toggleBlock('h1') },
    { label: 'Heading 2', hint: 'Heading 2', icon: <TextHTwo className="h-4 w-4" />, run: () => toggleBlock('h2') },
    {
      label: 'Heading 3',
      hint: 'Heading 3',
      icon: <TextHThree className="h-4 w-4" />,
      run: () => toggleBlock('h3'),
    },
    { label: 'Quote', hint: 'Quote', icon: <Quotes className="h-4 w-4" />, run: () => toggleBlock('quote') },
    { label: 'Code', hint: 'Inline code', icon: <Code className="h-4 w-4" />, run: () => applyFormat('code') },
    {
      label: 'Code block',
      hint: 'Code block',
      icon: <CodeBlock className="h-4 w-4" />,
      run: () => insertCode({}),
    },
    { label: 'Link', hint: 'Link (⌘K)', icon: <LinkSimple className="h-4 w-4" />, run: () => openLink() },
    {
      label: 'Bulleted list',
      hint: 'Bulleted list',
      icon: <ListBullets className="h-4 w-4" />,
      run: () => toggleList('bullet'),
    },
    {
      label: 'Numbered list',
      hint: 'Numbered list',
      icon: <ListNumbers className="h-4 w-4" />,
      run: () => toggleList('number'),
    },
    {
      label: 'Checklist',
      hint: 'Checklist',
      icon: <ListChecks className="h-4 w-4" />,
      run: () => toggleList('check'),
    },
    { label: 'Divider', hint: 'Horizontal divider', icon: <Minus className="h-4 w-4" />, run: () => insertBreak() },
  ]

  return (
    <div
      role="toolbar"
      aria-label="Format text"
      className="flex flex-wrap items-center gap-0.5 border-b border-line pb-2.5"
    >
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          title={b.hint}
          aria-label={b.label}
          // Keep focus in the editor: without this the selection — and with
          // it the formatting target — is lost on mousedown.
          onMouseDown={(e) => e.preventDefault()}
          onClick={b.run}
          className="press rounded-md p-2 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
        >
          {b.icon}
        </button>
      ))}
    </div>
  )
}

// --------------------------------------------------------------- the editor

export function RichEditor({
  markdown,
  onChange,
}: {
  /** Markdown source of truth — owned by the entry editor, not by us. */
  markdown: string
  /**
   * Fires on every edit. `initialNormalize` is true for the import-time
   * normalization pass (bullet flavor, stray whitespace) — same words,
   * tidier bytes — so the caller can sync state without crying dirty.
   */
  onChange: (markdown: string, initialNormalize: boolean) => void
}) {
  const ref = useRef<MDXEditorMethods>(null)

  // Reflect outside edits (post-load hydration, realtime updates from
  // another client) into the editor. Keystroke edits already match — the
  // guard keeps us from resetting the caret on every render.
  useEffect(() => {
    const ed = ref.current
    if (ed && ed.getMarkdown() !== markdown) ed.setMarkdown(markdown)
  }, [markdown])

  return (
    <MDXEditor
      ref={ref}
      markdown={markdown}
      onChange={onChange}
      contentEditableClassName="echoes-rich"
      placeholder="The bread, the weather, the argument, the walk — start anywhere."
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        codeBlockPlugin({ defaultCodeBlockLanguage: '' }),
        markdownShortcutPlugin(),
        toolbarPlugin({ toolbarContents: () => <JournalToolbar /> }),
      ]}
    />
  )
}

export function RichEditorLoading() {
  return (
    <div className="space-y-2.5 pt-8" aria-label="Loading editor">
      <div className="skeleton-line h-3 w-full" />
      <div className="skeleton-line h-3 w-full" />
      <div className="skeleton-line h-3 w-11/12" />
      <div className="flex items-center gap-1.5 pt-2 font-mono text-[10.5px] text-ink-faint">
        <Check weight="bold" className="h-3 w-3 animate-pulse" /> preparing the page…
      </div>
    </div>
  )
}
