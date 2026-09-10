"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, Extension } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { Markdown, MarkdownStorage, MarkdownNodeSpec } from "tiptap-markdown";
import { BLANK_LINE } from "../lib/blankLine";
import toast from "react-hot-toast";
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, ImageOff, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

declare module "@tiptap/core" {
  interface Storage {
    markdown: MarkdownStorage;
  }
}

// A video embedded in a card reuses the image node (serialized as `![](url)`);
// its on-disk extension is what marks it as video. Mirror of isVideoUrl in
// CardContent so the two render paths agree on what counts as a video.
function isVideoSrc(src: string): boolean {
  return /\.(mp4|webm|mov|ogv)(\?.*)?$/i.test(src);
}

// Media is a BLOCK node here (the image extension's default), but the markdown
// serializer tiptap-markdown ships for it is the INLINE one — it writes the
// `![](url)` and stops, never closing the block. Whatever followed the image
// then got written onto the same line, so the line break after an image was
// swallowed (`![](url)next line` instead of two blocks). Closing the block after
// a block-level image restores it.
const mediaImageMarkdown: MarkdownNodeSpec = {
  serialize(state, node) {
    const alt = state.esc(node.attrs.alt || "");
    const src = String(node.attrs.src || "").replace(/[()]/g, "\\$&");
    const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : "";
    state.write(`![${alt}](${src}${title})`);
    if (!node.type.isInline) state.closeBlock(node);
  },
  parse: {
    // handled by markdown-it
  },
};

// Extends the Image node with a node view so a video src renders as a real
// <video> preview in the editor instead of a broken-image icon. Rendering only —
// the node still serializes to `![](url)` markdown via tiptap-markdown, so the
// study view (CardContent) and refine pipeline are unaffected.
const MediaImage = Image.extend({
  addStorage() {
    return { markdown: mediaImageMarkdown };
  },
  addNodeView() {
    return ({ node }) => {
      const src: string = node.attrs.src || "";
      const dom = document.createElement(isVideoSrc(src) ? "video" : "img");
      dom.setAttribute("src", src);
      dom.classList.add("rich-card-editor-media");
      if (dom instanceof HTMLVideoElement) {
        dom.controls = true;
        dom.preload = "metadata";
      } else if (node.attrs.alt) {
        dom.setAttribute("alt", node.attrs.alt);
      }
      return { dom };
    };
  },
});

// Paragraph that survives a markdown round-trip when it is EMPTY. The default
// serializer writes an empty paragraph as nothing at all, so a blank line the
// user deliberately left (typically to space two images apart) vanished on save.
// Writing the BLANK_LINE sentinel instead keeps it as a real markdown paragraph;
// normalizeBlankLines() below converts it back to an empty paragraph on load, so
// the sentinel never surfaces to the user in the editor.
const blankLineParagraphMarkdown: MarkdownNodeSpec = {
  serialize(state, node) {
    if (node.content.size === 0) state.write(BLANK_LINE);
    else state.renderInline(node);
    state.closeBlock(node);
  },
  parse: {
    // handled by markdown-it
  },
};

const SpacedParagraph = Paragraph.extend({
  addStorage() {
    return { markdown: blankLineParagraphMarkdown };
  },
});

// Turns each BLANK_LINE-sentinel paragraph back into a genuinely empty one after
// content is loaded, so the caret/backspace behave normally instead of tripping
// over an invisible character. Re-serializing writes the sentinel back out, so
// this is a no-op as far as the emitted markdown is concerned.
function normalizeBlankLines(editor: Editor) {
  const ranges: { from: number; to: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    // Only a paragraph holding exactly one text node of sentinel — an image
    // contributes nothing to textContent, so the childCount check keeps a
    // paragraph like `![](url)` plus a stray nbsp from being emptied.
    if (
      node.type.name === "paragraph" &&
      node.childCount === 1 &&
      node.firstChild?.isText &&
      node.textContent === BLANK_LINE
    ) {
      ranges.push({ from: pos + 1, to: pos + node.nodeSize - 1 });
      return false;
    }
    return true;
  });
  if (!ranges.length) return;

  // Delete back-to-front so the earlier (unmapped) positions stay valid.
  const transaction = editor.state.tr;
  for (let index = ranges.length - 1; index >= 0; index--) {
    transaction.delete(ranges[index].from, ranges[index].to);
  }
  editor.view.dispatch(transaction.setMeta("addToHistory", false));
}

interface RichCardEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  // Bumping this forces the editor to reload `value` (e.g. switching cards).
  resetKey: string | number;
  // Drops the formatting toolbar and renders the editable area alone. For the deck table's
  // cells, where one editor is mounted at a time in a cell the width of half a row: a
  // seven-button toolbar over every cell would outweigh the text it formats, and the
  // markdown input rules carry the same formatting anyway — typing "1. " starts a numbered
  // list, "- " a bullet, "**bold**" bolds. Pasting an image still uploads and embeds it.
  // The full toolbar (link modal, file picker, media removal) stays with the card editor.
  bare?: boolean;
  // Focus the editable area as soon as it mounts. The table mounts an editor in response to
  // a click or an Enter on a cell, so the caret belongs in it — unlike the card editor,
  // which opens as one of several fields in a modal.
  autoFocus?: boolean;
  // Fired on Escape and on focus leaving the editable area — how a cell editor is dismissed
  // back to its rendered form. The card editor passes neither and keeps its always-on shape.
  onDone?: () => void;
  ariaLabel?: string;
}

// Uploads a pasted/picked image or video file and returns the URL to embed, or
// null on failure.
async function uploadMedia(file: File): Promise<string | null> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/modules/rune/api/uploads", { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    toast.error(body.error || "Failed to upload file");
    return null;
  }
  const { url } = await response.json();
  return url;
}

// A media upload can take a noticeable moment (large image/video, slow phone
// connection). Without feedback the pasted/picked file just silently vanishes
// until the fetch resolves, which reads as "nothing happened". These decorations
// render a transient "Uploading…" spinner inline at the insert point while the
// upload is in flight. They live ONLY as ProseMirror decorations — never as real
// nodes — so they never enter the document or the serialized markdown; once the
// upload resolves we swap in the real image node at the placeholder's (mapped)
// position, or drop the placeholder on failure.
const uploadPlaceholderKey = new PluginKey<DecorationSet>("rune-upload-placeholder");

// A transaction meta payload that adds or removes a single placeholder by identity.
interface PlaceholderMeta {
  add?: { id: object; pos: number };
  remove?: { id: object };
}

const uploadPlaceholderPlugin = new Plugin<DecorationSet>({
  key: uploadPlaceholderKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      // Keep existing placeholders anchored across concurrent edits.
      set = set.map(tr.mapping, tr.doc);
      const meta = tr.getMeta(uploadPlaceholderKey) as PlaceholderMeta | undefined;
      if (meta?.add) {
        // WIDGET — spinner + label rendered at the paste/insert point.
        const wrapper = document.createElement("span");
        wrapper.className = "rich-card-editor-upload-placeholder";
        const spinner = document.createElement("span");
        spinner.className = "rich-card-editor-upload-spinner";
        const label = document.createElement("span");
        label.textContent = "Uploading…";
        wrapper.append(spinner, label);
        const deco = Decoration.widget(meta.add.pos, wrapper, { id: meta.add.id });
        set = set.add(tr.doc, [deco]);
      } else if (meta?.remove) {
        const id = meta.remove.id;
        set = set.remove(set.find(undefined, undefined, (spec) => spec.id === id));
      }
      return set;
    },
  },
  props: {
    decorations(state) {
      return uploadPlaceholderKey.getState(state);
    },
  },
});

// Tiptap extension wrapper so the placeholder plugin is registered with the editor.
const UploadPlaceholder = Extension.create({
  name: "runeUploadPlaceholder",
  addProseMirrorPlugins() {
    return [uploadPlaceholderPlugin];
  },
});

// Current position of a placeholder widget by identity, or null if it's gone
// (e.g. the user deleted the surrounding content mid-upload).
function findPlaceholderPos(view: EditorView, id: object): number | null {
  const set = uploadPlaceholderKey.getState(view.state);
  const found = set?.find(undefined, undefined, (spec) => spec.id === id) ?? [];
  return found.length ? found[0].from : null;
}

// Inserts a spinner placeholder at the current selection, uploads the file, then
// swaps the placeholder for the real image node (or removes it on failure).
// Shared by both the paste handler and the attach-button picker.
function uploadWithPlaceholder(view: EditorView, file: File) {
  const id = {};
  const { from, to } = view.state.selection;
  // Replace any selected content, then drop the placeholder where the cursor was.
  let tr = view.state.tr;
  if (from !== to) tr = tr.delete(from, to);
  tr = tr.setMeta(uploadPlaceholderKey, { add: { id, pos: from } });
  view.dispatch(tr);

  uploadMedia(file).then((url) => {
    const pos = findPlaceholderPos(view, id);
    const resolveTr = view.state.tr.setMeta(uploadPlaceholderKey, { remove: { id } });
    if (url && pos !== null) {
      // Insert at the placeholder's mapped position, letting ProseMirror fit the
      // (block) image node into the surrounding content — same as a direct paste.
      const node = view.state.schema.nodes.image.create({ src: url });
      resolveTr.setSelection(TextSelection.create(resolveTr.doc, pos)).replaceSelectionWith(node);
    }
    view.dispatch(resolveTr);
  });
}

export default function RichCardEditor({ value, onChange, placeholder, resetKey, bare = false, autoFocus = false, onDone, ariaLabel }: RichCardEditorProps) {
  // Avoids feeding the editor's own onUpdate output back into itself via the `value` prop.
  const lastEmitted = useRef(value);
  // Hidden file input behind the toolbar's attach button — the reliable way to
  // add an image/video on mobile (Firefox Android), where pasting a media file
  // into a contenteditable is unreliable.
  const fileInputRef = useRef<HTMLInputElement>(null);

  // STATE
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrlInput, setLinkUrlInput] = useState("");
  // Captured when the Link button is clicked — the modal's input stealing focus
  // can otherwise leave the editor's selection in a stale/collapsed state.
  const linkSelectionRange = useRef<{ from: number; to: number } | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    // Tiptap v3 default-disables re-rendering on selection-only transactions (perf
    // optimization). Without this, editor.isActive(...) in JSX (bold/italic/link/image
    // toolbar highlighting) reads a stale snapshot on pure clicks/cursor moves — it only
    // happens to look right after a content-changing edit. This toolbar is tiny, so the
    // perf cost of always re-rendering is negligible.
    shouldRerenderOnTransaction: true,
    extensions: [
      // The stock paragraph is swapped for SpacedParagraph so empty paragraphs
      // (blank lines) survive markdown serialization.
      StarterKit.configure({ heading: { levels: [1, 2] }, paragraph: false }),
      SpacedParagraph,
      MediaImage,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder || "" }),
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
      UploadPlaceholder,
    ],
    content: value,
    onCreate: ({ editor }) => normalizeBlankLines(editor),
    onUpdate: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown();
      lastEmitted.current = markdown;
      onChange(markdown);
    },
    editorProps: {
      attributes: {
        class: "rich-card-editor-content",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
      handleKeyDown: (_view, event) => {
        // Escape leaves the cell rather than bubbling to whatever modal or drawer is above
        // — nothing else in the editor consumes it. Only wired when the caller asked for a
        // dismissable editor; the card editor has no "done" to go back to.
        if (event.key === "Escape" && onDone) {
          event.preventDefault();
          onDone();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const mediaItem = items.find(
          (item) => item.type.startsWith("image/") || item.type.startsWith("video/")
        );
        if (!mediaItem) return false;

        const file = mediaItem.getAsFile();
        if (!file) return false;

        event.preventDefault();
        // Show a spinner placeholder immediately, then swap in the media on upload.
        uploadWithPlaceholder(view, file);
        return true;
      },
    },
  });

  // Reload content when switching cards (or opening for add vs. edit).
  useEffect(() => {
    if (editor && value !== lastEmitted.current) {
      editor.commands.setContent(value);
      normalizeBlankLines(editor);
      lastEmitted.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, editor]);

  // AUTOFOCUS — after the editor exists, with the caret at the end of whatever is already
  // there. A cell editor is opened on a card that usually has text; dropping the caret at
  // position 0 would make the first keystroke prepend to it.
  useEffect(() => {
    if (editor && autoFocus) editor.commands.focus("end");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, autoFocus]);

  if (!editor) return null;

  // Uploads a picked image/video file, showing a spinner placeholder at the
  // cursor while it uploads, then inserts it in place.
  function insertPickedMedia(file: File) {
    if (!editor) return;
    editor.chain().focus().run();
    uploadWithPlaceholder(editor.view, file);
  }

  return (
    <div
      className={`rich-card-editor ${bare ? "rich-card-editor--bare" : ""}`}
      // Focus leaving the whole editor (not just moving between its own nodes) is the other
      // way out of a cell, alongside Escape. `relatedTarget` inside the editor means the
      // focus never actually left.
      onBlur={onDone ? (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDone();
      } : undefined}
    >
      {/* TOOLBAR — dropped in `bare` mode; see the prop's note. */}
      {!bare && (
      <div className="rich-card-editor-toolbar">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive("bold") ? "is-active" : ""}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive("italic") ? "is-active" : ""}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive("bulletList") ? "is-active" : ""}
          title="Bullet list"
        >
          <List className="w-4 h-4" />
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive("orderedList") ? "is-active" : ""}
          title="Numbered list"
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            const { from, to } = editor.state.selection;
            linkSelectionRange.current = { from, to };
            setLinkUrlInput(editor.getAttributes("link").href || "");
            setShowLinkModal(true);
          }}
          className={editor.isActive("link") ? "is-active" : ""}
          title="Link"
        >
          <LinkIcon className="w-4 h-4" />
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={() => fileInputRef.current?.click()}
          title="Attach image or video"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={() => editor.chain().focus().deleteSelection().run()}
          disabled={!editor.isActive("image")}
          className={editor.isActive("image") ? "is-active" : ""}
          title="Remove selected media (tap an image/video to select it, then tap here)"
        >
          <ImageOff className="w-4 h-4" />
        </button>
      </div>
      )}

      {/* HIDDEN MEDIA FILE INPUT — opened by the attach button above */}
      {!bare && (
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) insertPickedMedia(file);
          // Reset so re-picking the same file still fires onChange.
          e.target.value = "";
        }}
      />
      )}


      {/* EDITABLE CONTENT — paste an image directly to embed it */}
      <EditorContent editor={editor} />

      {/* INSERT LINK MODAL — reached from the toolbar, so it goes with it. */}
      {!bare && (
      <Modal
        isOpen={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        title="Insert Link"
        footer={
          <div className="flex gap-2 justify-end">
            {/* CANCEL BUTTON */}
            <Button onClick={() => setShowLinkModal(false)} className="btn-off">
              Cancel
            </Button>

            {/* CONFIRM BUTTON */}
            <Button
              onClick={() => {
                const range = linkSelectionRange.current;
                let chain = editor.chain().focus();
                if (range) chain = chain.setTextSelection(range);
                if (linkUrlInput.trim()) {
                  chain.extendMarkRange("link").setLink({ href: linkUrlInput.trim() }).run();
                } else {
                  chain.unsetLink().run();
                }
                setShowLinkModal(false);
              }}
              className="btn-blue"
            >
              {linkUrlInput.trim() ? "Save" : "Remove Link"}
            </Button>
          </div>
        }
      >
        {/* URL FIELD */}
        <input
          type="url"
          className="input-field w-full"
          placeholder="https://example.com"
          value={linkUrlInput}
          onChange={(e) => setLinkUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const range = linkSelectionRange.current;
              if (linkUrlInput.trim()) {
                let chain = editor.chain().focus();
                if (range) chain = chain.setTextSelection(range);
                chain.extendMarkRange("link").setLink({ href: linkUrlInput.trim() }).run();
              }
              setShowLinkModal(false);
            }
          }}
          autoFocus
        />
      </Modal>
      )}
    </div>
  );
}
