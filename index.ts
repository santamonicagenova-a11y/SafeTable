import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Non autorizzato" }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ error: "Non autorizzato" }, 401);
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (!profile || profile.subscription_status !== "active") return json({ error: "Abbonamento non attivo" }, 403);

    const { phone, persone, importo_persona, note } = await req.json();
    if (!phone || !persone || !importo_persona) return json({ error: "Dati mancanti" }, 400);

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price_data: {
        currency: "eur",
        product_data: {
          name: `Cauzione prenotazione — ${profile.ristorante}`,
          description: `${persone} person${persone>1?"e":"a"} × €${importo_persona}${note ? " — "+note : ""}`,
        },
        unit_amount: Math.round(importo_persona * persone * 100),
      }, quantity: 1 }],
      after_completion: { type: "redirect", redirect: { url: "https://safetableapp.com?cauzione=pagata" } },
      metadata: { ristorante: profile.ristorante, ristorante_id: user.id, phone, persone: String(persone), importo_persona: String(importo_persona) },
    });

    const { data: cauzione, error: dbErr } = await supabase.from("cauzioni").insert([{
      ristorante_id: user.id, ristorante: profile.ristorante, phone, persone,
      importo_persona, totale: importo_persona * persone, note: note || null,
      stripe_payment_link: paymentLink.url, stripe_payment_link_id: paymentLink.id, status: "in_attesa",
    }]).select().single();

    if (dbErr) return json({ error: "Errore salvataggio" }, 500);
    return json({ success: true, link: paymentLink.url, cauzione_id: cauzione.id });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors } });
}
