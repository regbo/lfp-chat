"use client";

import { useEffect, useState } from "react";
import {
  Streamdown,
  type StreamdownProps,
} from "streamdown";

type PluginEntry = readonly [string, unknown];
const DISABLED_LINK_SAFETY = { enabled: false } as const;

function requestedPlugins(markdown: string): Promise<PluginEntry>[] {
  const imports: Promise<PluginEntry>[] = [];

  if (/```/.test(markdown)) {
    imports.push(
      import("@streamdown/code").then(({ code }) => ["code", code] as const),
    );
  }
  if (/```mermaid\b/i.test(markdown)) {
    imports.push(
      import("@streamdown/mermaid").then(
        ({ mermaid }) => ["mermaid", mermaid] as const,
      ),
    );
  }
  if (/\$\$|\\\(|\\\[/.test(markdown)) {
    imports.push(
      import("@streamdown/math").then(({ math }) => ["math", math] as const),
    );
  }
  if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(markdown)) {
    imports.push(
      import("@streamdown/cjk").then(({ cjk }) => ["cjk", cjk] as const),
    );
  }

  return imports;
}

export function StreamdownRenderer({ children, plugins, ...props }: StreamdownProps) {
  const markdown = typeof children === "string" ? children : "";
  const [detectedPlugins, setDetectedPlugins] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let active = true;
    const imports = requestedPlugins(markdown);
    if (imports.length === 0) {
      return () => {
        active = false;
      };
    }

    void Promise.all(imports).then((entries) => {
      if (active) setDetectedPlugins(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [markdown]);

  return (
    <Streamdown
      linkSafety={DISABLED_LINK_SAFETY}
      plugins={{ ...detectedPlugins, ...plugins } as never}
      {...props}
    >
      {children}
    </Streamdown>
  );
}
