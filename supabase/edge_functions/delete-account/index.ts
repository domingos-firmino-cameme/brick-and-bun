import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const allowedOrigin = Deno.env.get("SITE_ORIGIN");
  if (!allowedOrigin || (origin && origin !== allowedOrigin)) {
    return new Response(JSON.stringify({ error: "Request origin is not allowed." }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  const headers = { ...corsHeaders, "Access-Control-Allow-Origin": allowedOrigin };
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers,
    });
  }

  const authorization = request.headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Account deletion is not configured." }), {
      status: 500,
      headers,
    });
  }

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "A valid signed-in account is required." }), {
      status: 401,
      headers,
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const user = userData.user;

  const { error: anonymizeError } = await adminClient
    .from("orders")
    .update({
      user_id: null,
      address_id: null,
      address_snapshot: {},
      customer_name: "Deleted customer",
      customer_email: "",
      customer_phone: "",
      customer_note: "",
    })
    .eq("user_id", user.id);
  if (anonymizeError) {
    return new Response(JSON.stringify({ error: "Could not anonymize past orders. The account was not deleted." }), {
      status: 500,
      headers,
    });
  }

  if (user.email) {
    const { error: newsletterError } = await adminClient
      .from("newsletter_subscribers")
      .delete()
      .eq("email", user.email.toLowerCase());
    if (newsletterError) {
      return new Response(JSON.stringify({ error: "Could not remove the newsletter subscription. The account was not deleted." }), {
        status: 500,
        headers,
      });
    }
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return new Response(JSON.stringify({ error: "Could not delete the account. Past orders were anonymized; please retry or contact support." }), {
      status: 500,
      headers,
    });
  }

  return new Response(JSON.stringify({ deleted: true }), { status: 200, headers });
});