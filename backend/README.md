# Garanzia CC — Backend (Supabase + Stripe LIVE)

Guida passo passo per attivare il backend reale. Tempo stimato: 30-40 minuti.

---

## 1. Prerequisiti

- Account **Stripe** completamente verificato (P.IVA, IBAN, documento) → chiavi `sk_live_...` e `pk_live_...` disponibili.
- Account **Supabase** (gratuito) → https://supabase.com
- **Node.js** installato sul tuo computer (per usare la CLI Supabase via `npx`).
- Un **dominio HTTPS** dove pubblicherai il frontend (es. `garanziacc.it` o un sottodominio GitHub Pages tipo `tuo-utente.github.io/garanzia-cc`). Stripe richiede HTTPS sui redirect.

---

## 2. Crea il progetto Supabase

1. Vai su https://supabase.com/dashboard → **New project**.
2. Nome: `garanzia-cc`. Region: `eu-west-1` (Irlanda) o `eu-central-1` (Francoforte).
3. Imposta una password DB (salvala).
4. Aspetta che il progetto sia pronto (~2 min).
5. Vai su **Project Settings → API**. Annota:
   - `Project URL`: `https://xxxxxx.supabase.co`
   - `anon public key`: `eyJhbGciOi...` (questa va nel frontend, è pubblica)
   - `service_role key`: `eyJhbGciOi...` (questa NON va nel frontend, solo nelle Edge Functions)
6. Annota anche il `Project ID` (la parte `xxxxxx` dell'URL).

---

## 3. Crea la tabella nel database

In Supabase dashboard → **SQL Editor** → **New query** → incolla il contenuto di `schema.sql` di questa cartella → **Run**.

---

## 4. Installa la CLI Supabase e collega il progetto

Apri un terminale nella cartella di questo progetto:

```bash
cd backend
npx supabase login
npx supabase link --project-ref IL_TUO_PROJECT_ID
```

(`IL_TUO_PROJECT_ID` è la parte `xxxxxx` dell'URL Supabase.)

---

## 5. Imposta i segreti Stripe

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_live_LA_TUA_CHIAVE_LIVE
npx supabase secrets set FRONTEND_URL=https://tuo-dominio.it
```

`FRONTEND_URL` serve a Stripe per il redirect dopo il completamento (es. `https://santamonicagenova-a11y.github.io/garanzia-cc`).

⚠️ Lascia da parte `STRIPE_WEBHOOK_SECRET` — lo imposterai al passo 7 dopo aver creato il webhook.

---

## 6. Deploy delle Edge Functions

```bash
npx supabase functions deploy create-setup-intent --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

Output atteso: due URL del tipo
- `https://xxxxxx.supabase.co/functions/v1/create-setup-intent`
- `https://xxxxxx.supabase.co/functions/v1/stripe-webhook`

---

## 7. Crea il webhook su Stripe

1. Vai su https://dashboard.stripe.com → assicurati di essere in **modalità live** (toggle in alto a destra OFF su "Modalità test").
2. **Sviluppatori → Webhook → Aggiungi endpoint**.
3. URL endpoint: `https://xxxxxx.supabase.co/functions/v1/stripe-webhook`
4. Eventi da ascoltare: seleziona solo **`checkout.session.completed`**.
5. Crea endpoint → copia il **Signing secret** (`whsec_...`).
6. Imposta il segreto su Supabase:

```bash
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_IL_TUO_SECRET
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

(Ridepoloyment necessario perché la function legga la nuova variabile.)

---

## 8. Configura il frontend

Apri `Garanzia CC.html` e cerca il blocco `BACKEND CONFIG`:

```js
const BACKEND = {
  SUPABASE_URL:  'https://xxxxxx.supabase.co',
  SUPABASE_ANON: 'eyJhbGci...',  // anon public key
};
```

Sostituisci con i valori del tuo progetto.

---

## 9. Test del flusso live

1. Apri `Garanzia CC.html` (anche da `file://` per il primo test).
2. Compila setup (es. 2 persone, 25€/p, 24h, "Trattoria Test").
3. Genera link verso il tuo numero WhatsApp.
4. Apri il link → vieni reindirizzato sulla Stripe hosted page → inserisci una carta vera (verrà solo tokenizzata, NESSUN addebito).
5. Stripe ti rimanda al frontend con stato `confirmed`.
6. Verifica su Stripe dashboard → **Pagamenti → Setup intents** che ci sia la registrazione.

---

## 10. Pubblica il frontend su GitHub Pages

```bash
git init
git add "Garanzia CC.html" backend/
git commit -m "Initial commit"
git remote add origin https://github.com/TUO_UTENTE/garanzia-cc.git
git push -u origin main
```

Su GitHub → repository → **Settings → Pages** → Source: `main` branch → `/root` → Save.

Il sito sarà disponibile su `https://TUO_UTENTE.github.io/garanzia-cc/Garanzia%20CC.html`.

⚠️ Aggiorna `FRONTEND_URL` su Supabase con questo dominio:

```bash
npx supabase secrets set FRONTEND_URL=https://TUO_UTENTE.github.io/garanzia-cc
npx supabase functions deploy create-setup-intent --no-verify-jwt
```

---

## File in questa cartella

- `schema.sql` — schema database (eseguilo in Supabase SQL Editor)
- `functions/create-setup-intent/index.ts` — crea Stripe Checkout setup session
- `functions/stripe-webhook/index.ts` — riceve eventi Stripe e aggiorna lo stato
- `functions/_shared/cors.ts` — header CORS condivisi

---

## Note di sicurezza

- La `service_role key` di Supabase **non deve mai** finire nel frontend HTML.
- La `sk_live_` di Stripe **non deve mai** finire nel frontend.
- L'`anon key` Supabase è pubblica per design (RLS protegge i dati).
- RLS è abilitata: i clienti possono leggere solo la propria cauzione tramite ID, le Edge Functions usano `service_role` lato server.

---

## Costi previsti

- **Supabase free tier**: 500 MB DB + 500K Edge Function invocations/mese — più che sufficiente.
- **Stripe**: 1.5% + 0.25€ per transazione effettiva (l'addebito penale). La sola registrazione carta è **gratuita**.
- **GitHub Pages**: gratuito.
