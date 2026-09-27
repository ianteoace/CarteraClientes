import { getCurrentUser } from "@/lib/auth/server";
import { getAuthorizationContextIfAvailable } from "@/lib/authorization";
import { serveConversationAttachment } from "@/lib/whatsapp/image-attachment-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return serveConversationAttachment(null, "");
  const context = await getAuthorizationContextIfAvailable(user.id);
  if (!context) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return serveConversationAttachment(context, (await params).id);
}
