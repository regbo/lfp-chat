import { ChatApp } from "@/components/chat-app";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return <ChatApp initialThreadId={threadId} />;
}
