// ============================================
// create-setup-intent
// Crea una Stripe Checkout Session in modalità "setup"
// (tokenizza la carta, NESSUN addebito immediato)
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

const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://example.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      short_id,
      telefono,
      nome_cliente,
      data_prenotazione,
      persone,
      penale,
      ore_disdetta,
      ristorante_nome,
      ristorante_phone,
    } = body;

    // Validazione base
    if (!short_id || !telefono || !persone || !penale || !ore_disdetta || !ristorante_nome) {
      return new Response(
        JSON.stringify({ error: "Campi obbligatori mancanti" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Crea (o aggiorna) la cauzione su Supabase
    const { data: existing } = await supabase
      .from("cauzioni")
      .select("id, stripe_session_url, status")
      .eq("short_id", short_id)
      .maybeSingle();

    if (existing && existing.status === "confirmed") {
      // già confermata, ritorna la session URL esistente (no-op)
      return new Response(
        JSON.stringify({ url: existing.stripe_session_url, already_confirmed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Crea la Stripe Checkout Session in modalità setup
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      payment_method_types: ["card"],
      success_url: `${FRONTEND_URL}/#/c/${short_id}?status=success`,
      cancel_url:  `${FRONTEND_URL}/#/c/${short_id}?status=cancel`,
      metadata: {
        short_id,
        telefono,
        ristorante_nome: ristorante_nome.slice(0, 100),
        persone: String(persone),
        penale: String(penale),
        ore_disdetta: String(ore_disdetta),
      },
      locale: "it",
    });

    // 3. Persisti la cauzione (insert o update)
    const cauzioneData = {
      short_id,
      telefono,
      nome_cliente: nome_cliente || null,
      data_prenotazione: data_prenotazione || null,
      persone,
      penale,
      ore_disdetta,
      ristorante_nome,
      ristorante_phone: ristorante_phone || null,
      status: "pending",
      stripe_session_id: session.id,
      stripe_session_url: session.url,
    };

    if (existing) {
      await supabase.from("cauzioni").update(cauzioneData).eq("short_id", short_id);
    } else {
      await supabase.from("cauzioni").insert(cauzioneData);
    }

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("create-setup-intent error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
