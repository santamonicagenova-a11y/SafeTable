// ============================================
// charge-cauzione
// Addebita la penale sulla carta tokenizzata
// (caso no-show o riduzione coperti oltre termine)
// ============================================

import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { short_id, importo_override } = await req.json();
    if (!short_id) {
      return new Response(JSON.stringify({ error: "short_id mancante" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Recupera cauzione
    const { data: cauzione, error: fetchErr } = await supabase
      .from("cauzioni")
      .select("*")
      .eq("short_id", short_id)
      .single();

    if (fetchErr || !cauzione) {
      return new Response(JSON.stringify({ error: "Cauzione non trovata" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (cauzione.status !== "confirmed") {
      return new Response(JSON.stringify({ error: "Cauzione non in stato confirmed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!cauzione.payment_method_id || !cauzione.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "Payment method mancante" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Calcola importo (in centesimi). Stripe vuole int cents.
    const totaleEuro = importo_override ?? (cauzione.persone * cauzione.penale);
    const amount = Math.round(totaleEuro * 100);

    if (amount < 50) {
      return new Response(JSON.stringify({ error: "Importo minimo 0.50€" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Crea PaymentIntent off-session sulla carta tokenizzata
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "eur",
      customer: cauzione.stripe_customer_id,
      payment_method: cauzione.payment_method_id,
      off_session: true,
      confirm: true,
      description: `No-show ${cauzione.ristorante_nome} · ${cauzione.persone} pers. · ${cauzione.penale}€/p`,
      metadata: {
        short_id,
        ristorante: cauzione.ristorante_nome,
        telefono: cauzione.telefono,
      },
    });

    // 4. Aggiorna stato cauzione
    await supabase
      .from("cauzioni")
      .update({
        status: "charged",
        charged_at: new Date().toISOString(),
        charged_amount: totaleEuro,
        stripe_payment_intent_id: paymentIntent.id,
      })
      .eq("short_id", short_id);

    return new Response(
      JSON.stringify({
        success: true,
        payment_intent_id: paymentIntent.id,
        amount: totaleEuro,
        status: paymentIntent.status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("charge-cauzione error:", err);
    // Errori comuni: card_declined, authentication_required, expired_card
    return new Response(
      JSON.stringify({
        error: err.message || "Addebito fallito",
        code: err.code || null,
        decline_code: err.decline_code || null,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
