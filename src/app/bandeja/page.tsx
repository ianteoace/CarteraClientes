import { notFound, redirect } from "next/navigation";
import { WorkspacePermission } from "@prisma/client";

import { ConversationList } from "@/components/inbox/conversation-list";
import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { listConversations } from "@/lib/conversation-repository";
import { getWorkspaceModules, isModuleEnabled } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; cursor?: string }> }) {
  if (!await getCurrentUser()) redirect("/login");
  const context = await getAuthorizationContext();
  const modules = await getWorkspaceModules(context);
  if (!isModuleEnabled(modules, WORKSPACE_MODULE.INBOX) || !hasPermission(context, WorkspacePermission.INBOX_VIEW)) notFound();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const filter = params.filter === "unread" ? "unread" : "all";
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const page = await listConversations(context, { search: query, filter, cursor });
  return <main className="app-page inbox-page"><div className="inbox-frame"><ConversationList page={page} query={query} filter={filter} /><div className="inbox-thread hidden items-center justify-center px-6 text-center text-sm text-muted lg:flex"><div><p className="text-lg font-semibold text-foreground">Tu Bandeja</p><p className="mt-2">Elegí una conversación para ver los mensajes y responder.</p></div></div></div></main>;
}
