"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  Bold,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Quote,
} from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";
import {
  insertLink,
  parseMarkdown,
  toggleBold,
  toggleBulletList,
  toggleHeading,
  toggleItalic,
  toggleOrderedList,
  toggleQuote,
  type MdEdit,
} from "@/lib/markdown";

const INLINE_RE =
  /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** Renders the supported Markdown subset to React nodes — never raw HTML. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  INLINE_RE.lastIndex = 0;

  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <strong key={n++} className="font-semibold text-text-primary">
          {match[1]}
        </strong>,
      );
    } else if (match[2] !== undefined) {
      nodes.push(<em key={n++}>{match[2]}</em>);
    } else if (match[3] !== undefined) {
      nodes.push(
        <code key={n++} className="rounded bg-bg-inset px-1 py-0.5 font-mono text-[12px]">
          {match[3]}
        </code>,
      );
    } else if (match[4] !== undefined && match[5] !== undefined) {
      nodes.push(
        <a
          key={n++}
          href={match[5]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2"
        >
          {match[4]}
        </a>,
      );
    }
    last = INLINE_RE.lastIndex;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownView({
  text,
  placeholder,
}: {
  text: string;
  placeholder?: string;
}) {
  if (!text.trim()) {
    return <p className="text-[13px] text-text-muted">{placeholder ?? "—"}</p>;
  }

  return (
    <div className="space-y-2.5 text-[13px] leading-relaxed text-text-secondary">
      {parseMarkdown(text).map((block, i) => {
        if (block.type === "heading") {
          return block.level === 2 ? (
            <h3 key={i} className="text-sm font-semibold text-text-primary">
              {renderInline(block.text)}
            </h3>
          ) : (
            <h4 key={i} className="text-[13px] font-semibold text-text-primary">
              {renderInline(block.text)}
            </h4>
          );
        }
        if (block.type === "list") {
          const items = block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>);
          return block.ordered ? (
            <ol key={i} className="list-decimal space-y-1 ps-5">
              {items}
            </ol>
          ) : (
            <ul key={i} className="list-disc space-y-1 ps-5">
              {items}
            </ul>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote
              key={i}
              className="whitespace-pre-line border-s-2 border-border-strong ps-3 text-text-muted"
            >
              {renderInline(block.text)}
            </blockquote>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "pressable grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40",
        active && "bg-bg-surface text-text-primary",
      )}
    >
      {icon}
    </button>
  );
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  dir = "ltr",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  dir?: "ltr" | "rtl";
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  const apply = (transform: (v: string, s: number, e: number) => MdEdit) => {
    const el = ref.current;
    if (!el) return;
    const result = transform(el.value, el.selectionStart, el.selectionEnd);
    onChange(result.text);
    requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const iconClass = "h-4 w-4";

  return (
    <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border bg-bg-secondary transition-colors focus-within:border-accent">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        <ToolButton
          icon={<Bold className={iconClass} />}
          label={t("md_bold")}
          disabled={preview}
          onClick={() => apply(toggleBold)}
        />
        <ToolButton
          icon={<Italic className={iconClass} />}
          label={t("md_italic")}
          disabled={preview}
          onClick={() => apply(toggleItalic)}
        />
        <ToolButton
          icon={<Heading2 className={iconClass} />}
          label={t("md_heading")}
          disabled={preview}
          onClick={() => apply(toggleHeading)}
        />
        <ToolButton
          icon={<List className={iconClass} />}
          label={t("md_bullet_list")}
          disabled={preview}
          onClick={() => apply(toggleBulletList)}
        />
        <ToolButton
          icon={<ListOrdered className={iconClass} />}
          label={t("md_numbered_list")}
          disabled={preview}
          onClick={() => apply(toggleOrderedList)}
        />
        <ToolButton
          icon={<Quote className={iconClass} />}
          label={t("md_quote")}
          disabled={preview}
          onClick={() => apply(toggleQuote)}
        />
        <ToolButton
          icon={<Link2 className={iconClass} />}
          label={t("md_link")}
          disabled={preview}
          onClick={() => apply(insertLink)}
        />
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <ToolButton
          icon={preview ? <Pencil className={iconClass} /> : <Eye className={iconClass} />}
          label={preview ? t("edit") : t("preview")}
          active={preview}
          onClick={() => setPreview((v) => !v)}
        />
      </div>

      {preview ? (
        <div className="min-h-40 px-3 py-2" dir={dir}>
          <MarkdownView text={value} placeholder={placeholder} />
        </div>
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir={dir}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="min-h-40 w-full resize-y bg-transparent px-3 py-2 text-[13px] leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none"
        />
      )}
    </div>
  );
}
