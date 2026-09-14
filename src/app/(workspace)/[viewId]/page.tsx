import { notFound } from "next/navigation";

import { serverConfig } from "@/lib/config";

export default async function ConfiguredViewPage({
  params,
}: {
  params: Promise<{ viewId: string }>;
}) {
  const { viewId } = await params;
  const href = `/${viewId}`;
  const configured = serverConfig.externalViews.some((view) => view.href === href) ||
    serverConfig.windmillEmbedViews.some((view) =>
      view.placement === "navigation" && view.href === href
    );
  if (!configured) notFound();
  return null;
}
