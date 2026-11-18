import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyStripeSignature(payload: string, signatureHeader: string, secret: string) {
  const entries = signatureHeader.split(",").map((part) => part.split("=", 2));
  const timestamp = entries.find(([key]) => key === "t")?.[1];
  const signatures = entries.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;

  const timestampSeconds = Number(timestamp);
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = toHex(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`)),
  );
  return signatures.some((signature) => safeEqual(signature, expected));
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const signatureHeader = request.headers.get("stripe-signature");
  if (
    !webhookSecret?.startsWith("whsec_") ||
    !stripeSecretKey?.startsWith("sk_test_") ||
    !supabaseUrl ||
    !serviceRoleKey ||
    !signatureHeader
  ) {
    return jsonResponse({ error: "Stripe test webhook is not configured." }, 503);
  }

  const payload = await request.text();
  if (!await verifyStripeSignature(payload, signatureHeader, webhookSecret)) {
    return jsonResponse({ error: "Invalid Stripe signature." }, 400);
  }

  let event: {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(payload);
  } catch {
    return jsonResponse({ error: "Invalid Stripe event payload." }, 400);
  }

  if (!["checkout.session.completed", "checkout.session.expired"].includes(event.type ?? "")) {
    return jsonResponse({ received: true }, 200);
  }

  const session = event.data?.object;
  const sessionId = session?.id;
  const metadata = session?.metadata as Record<string, unknown> | undefined;
  const orderId = metadata?.order_id;
  const userId = metadata?.user_id;
  if (
    typeof sessionId !== "string" ||
    !sessionId.startsWith("cs_test_") ||
    typeof orderId !== "string" ||
    typeof userId !== "string"
  ) {
    return jsonResponse({ error: "Checkout event is missing its order reference." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, user_id, subtotal, payment_status, stripe_checkout_session_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) return jsonResponse({ error: "Could not verify the checkout order." }, 500);
  if (
    !order ||
    order.user_id !== userId ||
    order.stripe_checkout_session_id !== sessionId
  ) {
    return jsonResponse({ error: "Checkout order reference did not match." }, 400);
  }

  if (event.type === "checkout.session.expired") {
    if (order.payment_status === "pending") {
      const { error } = await admin
        .from("orders")
        .update({ status: "cancelled", payment_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("stripe_checkout_session_id", sessionId)
        .eq("payment_status", "pending");
      if (error) return jsonResponse({ error: "Could not expire the unpaid order." }, 500);
    }
    return jsonResponse({ received: true }, 200);
  }

  if (
    session?.livemode !== false ||
    session?.mode !== "payment" ||
    session?.payment_status !== "paid" ||
    session?.currency !== "usd" ||
    Number(session?.amount_total) !== Math.round(Number(order.subtotal) * 100)
  ) {
    return jsonResponse({ error: "Stripe payment did not match the order total." }, 400);
  }

  if (order.payment_status === "paid") return jsonResponse({ received: true }, 200);
  if (order.payment_status !== "pending") return jsonResponse({ received: true }, 200);

  const { data: updated, error: updateError } = await admin
    .from("orders")
    .update({
      status: "received",
      payment_status: "paid",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("stripe_checkout_session_id", sessionId)
    .eq("payment_status", "pending")
    .select("id");
  if (updateError) return jsonResponse({ error: "Could not confirm the paid order." }, 500);
  if (!updated?.length) return jsonResponse({ error: "Order payment state changed unexpectedly." }, 409);

  return jsonResponse({ received: true }, 200);
});