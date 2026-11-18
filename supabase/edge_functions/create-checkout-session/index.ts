import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };

function response(body: Record<string, unknown>, status: number, origin?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...jsonHeaders,
      ...(origin
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Vary": "Origin",
          }
        : {}),
    },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function failPendingOrder(supabase: ReturnType<typeof createClient>, orderId: string) {
  try {
    const { error } = await supabase.rpc("fail_pending_order", { p_order_id: orderId });
    if (error) {
      console.error("Could not mark the pending Stripe order as failed.", { orderId, error });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Could not reach Supabase to mark the pending Stripe order as failed.", {
      orderId,
      error,
    });
    return false;
  }
}

Deno.serve(async (request) => {
  const siteOrigin = Deno.env.get("SITE_ORIGIN");
  const requestOrigin = request.headers.get("origin");
  if (!siteOrigin || requestOrigin !== siteOrigin) {
    return response({ error: "Request origin is not allowed." }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": siteOrigin,
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
      },
    });
  }

  if (request.method !== "POST") {
    return response({ error: "Method not allowed." }, 405, siteOrigin);
  }

  const authorization = request.headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !anonKey) {
    return response({ error: "A signed-in customer is required." }, 401, siteOrigin);
  }
  if (!stripeSecretKey?.startsWith("sk_test_")) {
    return response({ error: "Stripe test mode is not configured." }, 503, siteOrigin);
  }

  let input: {
    address_id?: unknown;
    items?: unknown;
    customer_note?: unknown;
  };
  try {
    input = await request.json();
  } catch {
    return response({ error: "Invalid checkout request." }, 400, siteOrigin);
  }

  if (!isUuid(input.address_id) || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) {
    return response({ error: "Choose a saved delivery address and check your cart." }, 400, siteOrigin);
  }
  if (
    typeof input.customer_note !== "undefined" &&
    typeof input.customer_note !== "string"
  ) {
    return response({ error: "The order note is invalid." }, 400, siteOrigin);
  }

  const items = input.items.map((item) => {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    if (
      !Number.isSafeInteger(candidate.product_id) ||
      !Number.isInteger(candidate.quantity) ||
      Number(candidate.quantity) < 1 ||
      Number(candidate.quantity) > 25
    ) {
      return null;
    }
    return {
      product_id: Number(candidate.product_id),
      quantity: Number(candidate.quantity),
    };
  });
  if (items.some((item) => item === null)) {
    return response({ error: "The cart contains an invalid item." }, 400, siteOrigin);
  }
  const validItems = items.filter((item): item is NonNullable<typeof item> => item !== null);
  const productIds = validItems.map((item) => item.product_id);
  if (new Set(productIds).size !== productIds.length) {
    return response({ error: "The cart contains a repeated product. Refresh your cart and try again." }, 400, siteOrigin);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult.user) {
    return response({ error: "A valid signed-in customer is required." }, 401, siteOrigin);
  }

  const { data: orderData, error: orderError } = await supabase.rpc("create_pending_order", {
    p_address_id: input.address_id,
    p_items: validItems,
    p_customer_note: (input.customer_note as string | undefined)?.slice(0, 500) ?? "",
  });
  if (orderError) {
    return response({ error: orderError.message || "Could not prepare this order." }, 400, siteOrigin);
  }

  const order = orderData as {
    order_id?: string;
    items?: Array<{
      name: string;
      description: string;
      quantity: number;
      unit_amount: number;
    }>;
  };
  if (!isUuid(order.order_id) || !Array.isArray(order.items) || order.items.length === 0) {
    return response({ error: "Could not prepare verified order details." }, 500, siteOrigin);
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  // O parâmetro payment_method_types foi removido por já não ser suportado pela Stripe[span_1](start_span)[span_1](end_span)
  form.set("client_reference_id", userResult.user.id);
  form.set("success_url", `${siteOrigin}/checkout.html?payment=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${siteOrigin}/checkout.html?payment=cancelled`);
  form.set("metadata[order_id]", order.order_id);
  form.set("metadata[user_id]", userResult.user.id);
  order.items.forEach((item, index) => {
    form.set(`line_items[${index}][quantity]`, String(item.quantity));
    form.set(`line_items[${index}][price_data][currency]`, "usd");
    form.set(`line_items[${index}][price_data][unit_amount]`, String(item.unit_amount));
    form.set(`line_items[${index}][price_data][product_data][name]`, item.name);
    form.set(`line_items[${index}][price_data][product_data][description]`, item.description.slice(0, 500));
  });

  let stripeResponse: Response;
  let stripeSession: {
    id?: string;
    url?: string;
    livemode?: boolean;
    error?: { message?: string };
  };
  try {
    stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    stripeSession = await stripeResponse.json();
    
    console.log("Stripe API Status:", stripeResponse.status);
    console.log("Stripe API Response Body:", JSON.stringify(stripeSession));

  } catch (err) {
    console.error("Network or parsing error reaching Stripe:", err);
    const orderCleanedUp = await failPendingOrder(supabase, order.order_id);
    if (!orderCleanedUp) {
      return response({
        error: "Could not reach Stripe, and the pending order could not be cleared. Contact support before trying again.",
      }, 500, siteOrigin);
    }
    return response({ error: "Could not reach Stripe. Your card has not been charged." }, 502, siteOrigin);
  }

  if (!stripeResponse.ok || !stripeSession.id || !stripeSession.url || stripeSession.livemode !== false) {
    const orderCleanedUp = await failPendingOrder(supabase, order.order_id);
    if (!orderCleanedUp) {
      return response({
        error: "Stripe checkout could not be started, and the pending order could not be cleared. Contact support before trying again.",
      }, 500, siteOrigin);
    }
    return response({ error: "Stripe could not start a test checkout. Your card has not been charged." }, 502, siteOrigin);
  }

  const { error: attachError } = await supabase.rpc("attach_stripe_checkout_session", {
    p_order_id: order.order_id,
    p_session_id: stripeSession.id,
  });
  if (attachError) {
    const expireResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(stripeSession.id)}/expire`, {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    }).catch((error) => {
      console.error("Could not expire the unlinked Stripe checkout session.", {
        orderId: order.order_id,
        sessionId: stripeSession.id,
        error,
      });
      return null;
    });
    const sessionExpired = expireResponse?.ok === true;
    if (!sessionExpired) {
      console.error("Stripe refused to expire the unlinked checkout session.", {
        orderId: order.order_id,
        sessionId: stripeSession.id,
        status: expireResponse?.status,
      });
    }
    const orderCleanedUp = await failPendingOrder(supabase, order.order_id);
    if (!sessionExpired || !orderCleanedUp) {
      return response({
        error: "The checkout session could not be linked and cleanup was incomplete. Contact support before trying again.",
      }, 500, siteOrigin);
    }
    return response({ error: "Could not safely link the Stripe session to your order." }, 500, siteOrigin);
  }

  return response({ checkout_url: stripeSession.url, order_id: order.order_id }, 200, siteOrigin);
});