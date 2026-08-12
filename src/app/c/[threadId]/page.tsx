import { HomeChatApp } from "@/components/home-chat-app";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return <HomeChatApp initialThreadId={threadId} />;
}
