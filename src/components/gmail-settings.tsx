"use client";

import { Mail, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type GmailAccount = { email: string; enabled: boolean };

export function GmailSettings() {
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/gmail", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as {
          accounts?: GmailAccount[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not load Gmail accounts.");
        }
        setAccounts(data.accounts || []);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        const message = cause instanceof Error ? cause.message : "Could not load Gmail accounts.";
        setError(message.toLowerCase().includes("not configured") ? "Gmail isn't available yet." : message);
      });
    return () => controller.abort();
  }, []);

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/gmail", { method: "POST" });
      const data = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !data.authorizationUrl) {
        throw new Error(data.error || "Could not start Gmail enrollment.");
      }
      window.location.assign(data.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start Gmail enrollment.");
      setBusy(false);
    }
  };

  return (
    <section className="settings-row">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
        <Mail className="size-4" />
      </span>
      <div className="min-w-0">
        <h2 className="chat-ui-emphasis">Gmail</h2>
        {accounts.length > 0 ? (
          <ul className="chat-ui-text mt-1 text-muted-foreground">
            {accounts.map((account) => <li key={account.email}>{account.email}</li>)}
          </ul>
        ) : (
          <p className="chat-ui-text mt-1 text-muted-foreground">
            Connect a mailbox to include new messages in family search and automations.
          </p>
        )}
        {error && <p className="chat-meta-text mt-2 text-destructive">{error}</p>}
      </div>
      <Button className="settings-row-action" disabled={busy} onClick={() => void connect()} size="sm">
        {busy && <LoaderCircle className="animate-spin" />}
        Connect Gmail
      </Button>
    </section>
  );
}
