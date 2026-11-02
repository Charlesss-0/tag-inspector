import { Check, Copy, Search } from "lucide-react";
import { type ReactNode, useState } from "react";
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}
export function JsonView({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  let offset = 0;
  return (
    <pre className="json">
      {text
        .split(
          /("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\btrue\b|\bfalse\b|\bnull\b|\b\d+\b)/g,
        )
        .map((part) => {
          offset += part.length;
          return (
            <span
              key={`${offset}-${part}`}
              className={
                part.endsWith(":")
                  ? "key"
                  : part.startsWith('"')
                    ? "string"
                    : "literal"
              }
            >
              {part}
            </span>
          );
        })}
    </pre>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Search size={24} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function SearchBox({
  value,
  change,
}: {
  value: string;
  change: (v: string) => void;
}) {
  return (
    <label className="search">
      <Search size={14} />
      <input
        aria-label="Search current section"
        placeholder="Filter by name, ID, or payload…"
        value={value}
        onChange={(e) => change(e.target.value)}
      />
    </label>
  );
}
