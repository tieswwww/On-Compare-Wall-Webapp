import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PayloadSchema = z.object({
  event_type: z.enum(["scanned", "swapped", "removed"]),
  side: z.enum(["left", "right"]),
  ean: z.string().min(1).max(32).optional().nullable(),
});

export async function handleShoeEventIngest(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.NODE_RED_PASSWORD;
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!expected || token !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { event_type, side, ean } = parsed.data;
  if ((event_type === "scanned" || event_type === "swapped") && !ean) {
    return Response.json({ error: "ean required" }, { status: 400 });
  }

  const { data: current } = await supabaseAdmin
    .from("shoe_slots")
    .select("ean")
    .eq("side", side)
    .maybeSingle();
  const previous_ean = current?.ean ?? null;

  const channel = supabaseAdmin.channel("shoe-events");
  try {
    await channel.send({
      type: "broadcast",
      event: "update",
      payload: {
        event_type,
        side,
        ean: ean ?? null,
        previous_ean,
        ts: new Date().toISOString(),
      },
    });
  } finally {
    await supabaseAdmin.removeChannel(channel);
  }

  const nextEan = event_type === "removed" ? null : ean!;
  const { error: slotErr } = await supabaseAdmin
    .from("shoe_slots")
    .update({ ean: nextEan, updated_at: new Date().toISOString() })
    .eq("side", side);
  if (slotErr) {
    return Response.json({ error: slotErr.message }, { status: 500 });
  }

  await supabaseAdmin.from("shoe_events").insert({
    event_type,
    side,
    ean: ean ?? null,
    previous_ean,
    raw: body as never,
  });

  return Response.json({ ok: true });
}
