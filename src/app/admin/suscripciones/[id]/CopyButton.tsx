"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface Props {
  value: string;
}

export function CopyButton({ value }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      onClick={handleCopy}
      title="Copiar"
      className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-secondary transition-all"
    >
      {copied ? (
        <Check className="h-3 w-3" style={{ color: "#4cd6a0" }} />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}
