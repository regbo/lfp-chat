"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import { ArrowDownIcon, DownloadIcon } from "lucide-react";
import type { ComponentProps, RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("chat-scroll-region relative flex-1 overflow-y-hidden", className)}
    initial="instant"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("flex flex-col gap-8 p-4", className)}
    {...props}
  />
);

export function ConversationSubmitAutoScroll({ request }: { request: number }) {
  const { scrollToBottom } = useStickToBottomContext();

  useEffect(() => {
    if (request === 0) return;
    void scrollToBottom({
      animation: "instant",
      duration: 250,
      ignoreEscapes: true,
    });
  }, [request, scrollToBottom]);

  return null;
}

export function ConversationViewportAutoScroll({
  resizeTargetRef,
}: {
  resizeTargetRef?: RefObject<Element | null>;
}) {
  const { scrollToBottom, state } = useStickToBottomContext();

  useEffect(() => {
    const viewport = window.visualViewport;
    let animationFrame = 0;

    const keepLockedToBottom = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = window.requestAnimationFrame(() => {
          if (state.escapedFromLock) return;
          void scrollToBottom({
            animation: "instant",
            ignoreEscapes: true,
          });
        });
      });
    };

    window.addEventListener("resize", keepLockedToBottom);
    viewport?.addEventListener("resize", keepLockedToBottom);
    viewport?.addEventListener("scroll", keepLockedToBottom);
    const resizeObserver = resizeTargetRef?.current
      ? new ResizeObserver(keepLockedToBottom)
      : undefined;
    if (resizeTargetRef?.current) {
      resizeObserver?.observe(resizeTargetRef.current);
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", keepLockedToBottom);
      viewport?.removeEventListener("resize", keepLockedToBottom);
      viewport?.removeEventListener("scroll", keepLockedToBottom);
    };
  }, [resizeTargetRef, scrollToBottom, state]);

  return null;
}

export function ConversationHistoryLoader({
  disabled,
  loading,
  onLoad,
}: {
  disabled: boolean;
  loading: boolean;
  onLoad: () => Promise<void>;
}) {
  const { scrollRef } = useStickToBottomContext();
  const inFlight = useRef(false);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || disabled) return;

    const handleScroll = async () => {
      if (element.scrollTop > 80 || inFlight.current || loading) return;
      inFlight.current = true;
      const previousHeight = element.scrollHeight;
      const previousTop = element.scrollTop;
      try {
        await onLoad();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        element.scrollTop = previousTop + element.scrollHeight - previousHeight;
      } finally {
        inFlight.current = false;
      }
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, [disabled, loading, onLoad, scrollRef]);

  return null;
}

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="chat-ui-text font-medium">{title}</h3>
          {description && (
            <p className="chat-ui-text text-muted-foreground">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted",
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};

const getMessageText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

export type ConversationDownloadProps = Omit<
  ComponentProps<typeof Button>,
  "onClick"
> & {
  messages: UIMessage[];
  filename?: string;
  formatMessage?: (message: UIMessage, index: number) => string;
};

const defaultFormatMessage = (message: UIMessage): string => {
  const roleLabel =
    message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${getMessageText(message)}`;
};

export const messagesToMarkdown = (
  messages: UIMessage[],
  formatMessage: (
    message: UIMessage,
    index: number
  ) => string = defaultFormatMessage
): string => messages.map((msg, i) => formatMessage(msg, i)).join("\n\n");

export const ConversationDownload = ({
  messages,
  filename = "conversation.md",
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [messages, filename, formatMessage]);

  return (
    <Button
      className={cn(
        "absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted",
        className
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <DownloadIcon className="size-4" />}
    </Button>
  );
};
