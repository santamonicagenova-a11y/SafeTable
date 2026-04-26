// ============================================
// stripe-webhook
// Riceve eventi da Stripe. Su checkout.session.completed
// (modalità setup), salva il payment_method e aggiorna
// lo status della cauzione a "confirmed".
// ============================================

import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log("Received event:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.mode !== "setup") {
      // ignora sessioni di pagamento (non dovremmo crearne, ma per sicurezza)
      return new Response("ignored (not setup mode)", { status: 200 });
    }

    const shortId = session.metadata?.short_id;
    if (!shortId) {
      console.error("Missing short_id in metadata");
      return new Response("Missing short_id", { status: 400 });
    }

    // Recupera il setup_intent per ottenere il payment_method
    const setupIntent = await stripe.setupIntents.retrieve(
      session.setup_intent as string,
    );

    const paymentMethodId = setupIntent.payment_method as string;
    const customerId = setupIntent.customer as string | null;

    // Aggiorna la cauzione
    const { error } = await supabase
      .from("cauzioni")
      .update({
        status: "confirmed",
        payment_method_id: paymentMethodId,
        stripe_customer_id: customerId,
        confirmed_at: new Date().toISOString(),
      })
      .eq("short_id", shortId);

    if (error) {
      console.error("Supabase update error:", error);
      return new Response(`DB error: ${error.message}`, { status: 500 });
    }

    console.log(`Cauzione ${shortId} confermata. PM: ${paymentMethodId}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
