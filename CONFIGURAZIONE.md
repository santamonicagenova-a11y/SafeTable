# SafeTable — Procedura completa di configurazione

Guida dettagliata, passo per passo, per portare SafeTable da zero a operativo in **modalità live** con Stripe e Supabase. Tempo totale stimato: **45-60 minuti** (esclusi i tempi di verifica Stripe, che possono richiedere 1-3 giorni lavorativi).

---

## Indice

1. [Verifica account Stripe (LIVE)](#1-verifica-account-stripe-live)
2. [Creazione progetto Supabase](#2-creazione-progetto-supabase)
3. [Schema database](#3-schema-database)
4. [Installazione strumenti locali](#4-installazione-strumenti-locali)
5. [Collegamento CLI a Supabase](#5-collegamento-cli-a-supabase)
6. [Configurazione segreti Stripe](#6-configurazione-segreti-stripe)
7. [Deploy delle 3 Edge Functions](#7-deploy-delle-3-edge-functions)
8. [Creazione webhook Stripe](#8-creazione-webhook-stripe)
9. [Configurazione frontend](#9-configurazione-frontend)
10. [Pubblicazione su GitHub Pages](#10-pubblicazione-su-github-pages)
11. [Test end-to-end LIVE](#11-test-end-to-end-live)
12. [Manutenzione e troubleshooting](#12-manutenzione-e-troubleshooting)

---

## 1. Verifica account Stripe (LIVE)

Stripe richiede l'attivazione completa dell'account prima di rilasciare le chiavi `sk_live_`. Senza questo passaggio nulla del resto funzionerà.

1. Vai su https://dashboard.stripe.com → registrati o accedi.
2. In alto a destra, sposta il toggle su **modalità Live** (di default è su Test).
3. Apri **Impostazioni → Attiva pagamenti** e completa:
   - **Tipo di attività**: ditta individuale, SRL, ecc.
   - **P.IVA / Codice Fiscale**.
   - **Documento d'identità** (carta o patente).
   - **IBAN del conto** dove riceverai gli accrediti.
   - **Sito web pubblico**: per ora puoi mettere l'URL GitHub Pages provvisorio (lo aggiorneremo dopo).
   - **Descrizione attività**: "Servizio di garanzia prenotazioni per ristoranti tramite tokenizzazione carta di credito. Nessun addebito al momento della registrazione. Penale addebitata solo in caso di no-show entro i termini comunicati al cliente".
4. Aspetta l'esito. Stripe risponde entro 1-3 giorni lavorativi. Quando ricevi conferma, vai in **Sviluppatori → Chiavi API** e annota:
   - **Chiave pubblicabile** `pk_live_...` (non ti serve per ora — il frontend non la usa direttamente perché non integriamo Stripe Elements).
   - **Chiave segreta** `sk_live_...` → **questa è critica, non condividerla con nessuno**.

> ⚠️ Se la verifica è ancora in corso, puoi comunque procedere ai passi successivi usando le chiavi `sk_test_` e una carta di test (`4242 4242 4242 4242`). Quando Stripe attiverà il live, basterà sostituire la chiave segreta e ridepoloyare le functions.

---

## 2. Creazione progetto Supabase

1. Vai su https://supabase.com/dashboard → **New project**.
2. Compila:
   - **Name**: `safetable` (o quello che preferisci).
   - **Database password**: generane una forte e **salvala in un password manager** (ti servirà per accessi avanzati al DB).
   - **Region**: `eu-west-1` (Irlanda) o `eu-central-1` (Francoforte) — la latenza più bassa per utenti italiani.
   - **Pricing plan**: Free.
3. Clicca **Create project** e aspetta 1-2 minuti.
4. Quando il progetto è pronto, vai su **Project Settings → API** e annota:
   - **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
   - **anon public key** (sezione "Project API keys"): `eyJhbGci...` — questa **è pubblica**, andrà nel frontend.
   - **service_role key** (sotto "anon public"): `eyJhbGci...` — questa **è SEGRETA**, NON va nel frontend, viene usata automaticamente dalle Edge Functions.
   - **Project ID**: la parte iniziale dell'URL (`xxxxxxxxxxxx`).

---

## 3. Schema database

1. In Supabase dashboard → **SQL Editor** (icona a sinistra) → **New query**.
2. Apri il file `backend/schema.sql` di questo progetto, copia **tutto** il contenuto.
3. Incolla nel SQL Editor di Supabase.
4. Clicca **Run** (in basso a destra).
5. Verifica: vai su **Table Editor** → dovresti vedere la tabella `cauzioni` con tutte le colonne.

---

## 4. Installazione strumenti locali

Sul tuo computer (Mac, Windows o Linux) servono:

### Node.js (necessario per `npx`)
- Vai su https://nodejs.org → scarica la versione **LTS**.
- Installa con le opzioni di default.
- Verifica in terminale:
  ```bash
  node --version    # dovrebbe mostrare v20.x.x o superiore
  npx --version     # dovrebbe mostrare 10.x.x o superiore
  ```

### Git (per push su GitHub)
- Su Mac è già installato. Su Windows scarica https://git-scm.com.
- Verifica:
  ```bash
  git --version
  ```

---

## 5. Collegamento CLI a Supabase

Apri un terminale e spostati nella cartella del progetto (quella che contiene `Garanzia CC.html` e la cartella `backend/`):

```bash
cd /percorso/al/progetto/safetable
```

### 5.1 Login a Supabase

```bash
npx supabase login
```

Questo aprirà il browser. Autorizza la CLI con il tuo account Supabase.

### 5.2 Collega il progetto locale al progetto Supabase

```bash
npx supabase link --project-ref TUO_PROJECT_ID
```

Sostituisci `TUO_PROJECT_ID` con il valore annotato al passo 2 (la parte iniziale dell'URL Supabase). Se ti chiede la password del DB, inserisci quella creata al passo 2.

> 💡 Su **Windows** usa sempre `npx supabase` e mai `supabase` da solo, perché il binario non è nel PATH.

---

## 6. Configurazione segreti Stripe

Le Edge Functions leggono le chiavi sensibili da variabili d'ambiente gestite da Supabase. Imposta:

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_live_LA_TUA_CHIAVE_LIVE
npx supabase secrets set FRONTEND_URL=https://tuo-utente.github.io/safetable
```

> ⚠️ `FRONTEND_URL` deve essere **senza slash finale** e **senza** path al file HTML. È la base usata da Stripe per il redirect dopo l'inserimento carta. Se non hai ancora il dominio GitHub Pages, mettine uno provvisorio — lo aggiornerai al passo 10.

`STRIPE_WEBHOOK_SECRET` lo imposterai al passo 8 (devi prima creare il webhook su Stripe).

Verifica che i segreti siano stati salvati:

```bash
npx supabase secrets list
```

Dovresti vedere `STRIPE_SECRET_KEY` e `FRONTEND_URL` (i valori sono mascherati per sicurezza).

---

## 7. Deploy delle 3 Edge Functions

```bash
npx supabase functions deploy create-setup-intent --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy charge-cauzione --no-verify-jwt
```

Ogni comando stamperà un URL del tipo:
- `https://xxxxxxxxxxxx.supabase.co/functions/v1/create-setup-intent`
- `https://xxxxxxxxxxxx.supabase.co/functions/v1/stripe-webhook`
- `https://xxxxxxxxxxxx.supabase.co/functions/v1/charge-cauzione`

**Annotali** — ti serve l'URL di `stripe-webhook` per il passo 8.

> 💡 Il flag `--no-verify-jwt` significa che le functions sono pubbliche (chiunque può chiamarle). Per `stripe-webhook` è necessario perché Stripe non passa JWT. Per le altre due usiamo comunque la `anon key` come header `apikey` (basta per il rate limiting Supabase). La sicurezza vera è nella firma del webhook (passo 8) e nel fatto che i dati sensibili non passano mai dal frontend.

### Verifica deploy

In Supabase dashboard → **Edge Functions** → dovresti vedere le 3 funzioni con stato "Deployed".

---

## 8. Creazione webhook Stripe

1. Vai su https://dashboard.stripe.com → **assicurati di essere in modalità LIVE** (toggle in alto a destra OFF su "Modalità test").
2. Apri **Sviluppatori → Webhook → Aggiungi endpoint**.
3. Compila:
   - **URL endpoint**: l'URL della funzione `stripe-webhook` annotato al passo 7.
   - **Descrizione**: `SafeTable - card setup completed`.
   - **Eventi da ascoltare**: clicca **+ Seleziona eventi** → cerca e seleziona **solo** `checkout.session.completed`.
4. Clicca **Aggiungi endpoint**.
5. Nella pagina di dettaglio del webhook appena creato, sezione **Signing secret**, clicca **Visualizza** e **copia** il valore `whsec_...`.

Ora imposta il segreto e ridepoloya la funzione (importante: senza redeploy la funzione non vede la nuova variabile):

```bash
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_IL_TUO_SECRET
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

### Test del webhook

Dalla dashboard Stripe, sul webhook appena creato, clicca **Invia evento di test** → seleziona `checkout.session.completed` → invia. Vai sui log della funzione su Supabase (**Edge Functions → stripe-webhook → Logs**): dovresti vedere "Received event: checkout.session.completed". Se vedi un errore "signature verification failed" hai sbagliato il `STRIPE_WEBHOOK_SECRET`.

---

## 9. Configurazione frontend

Apri `Garanzia CC.html` (puoi rinominarlo `index.html` se vuoi che sia la pagina principale del sito GitHub Pages).

Cerca il blocco:

```js
const BACKEND = /*BACKEND-BEGIN*/{
  SUPABASE_URL:  '',
  SUPABASE_ANON: '',
}/*BACKEND-END*/;
```

Sostituisci con:

```js
const BACKEND = /*BACKEND-BEGIN*/{
  SUPABASE_URL:  'https://xxxxxxxxxxxx.supabase.co',
  SUPABASE_ANON: 'eyJhbGci...',
}/*BACKEND-END*/;
```

Salva il file.

> ⚠️ Verifica due volte: la chiave deve essere la **anon public key**, non la `service_role`. Se per errore metti la service_role nel frontend, **revoca immediatamente** entrambe le chiavi dalla dashboard Supabase e generane di nuove.

---

## 10. Pubblicazione su GitHub Pages

### 10.1 Crea il repository

1. Vai su https://github.com/new.
2. Nome: `safetable`.
3. Visibilità: pubblica (necessaria per il free tier di GitHub Pages) o privata (richiede GitHub Pro).
4. **Non** inizializzare con README/license/gitignore.
5. Crea.

### 10.2 Push del codice

Nella cartella locale del progetto:

```bash
git init
git add "Garanzia CC.html" backend/ CONFIGURAZIONE.md
git commit -m "Initial commit: SafeTable v1"
git branch -M main
git remote add origin https://github.com/TUO_UTENTE/safetable.git
git push -u origin main
```

> 💡 Se git ti chiede credenziali, su Windows usa il **Credential Manager** (si apre da solo). Su Mac usa la **Keychain**. Se non funziona, crea un **Personal Access Token** da https://github.com/settings/tokens (classic, scope `repo`) e usalo come password.

### 10.3 Attiva GitHub Pages

1. Sul repo GitHub → **Settings → Pages**.
2. **Source**: `Deploy from a branch`.
3. **Branch**: `main`, folder `/ (root)`.
4. **Save**.
5. Aspetta 1-2 minuti. La URL del sito sarà:
   ```
   https://TUO_UTENTE.github.io/safetable/Garanzia%20CC.html
   ```
   Oppure, se hai rinominato in `index.html`:
   ```
   https://TUO_UTENTE.github.io/safetable/
   ```

### 10.4 Aggiorna FRONTEND_URL

Ora che hai l'URL definitivo, aggiorna il segreto su Supabase e ridepoloya:

```bash
npx supabase secrets set FRONTEND_URL=https://TUO_UTENTE.github.io/safetable
npx supabase functions deploy create-setup-intent --no-verify-jwt
```

> ⚠️ Senza la `/` finale. Il codice della function aggiunge automaticamente `/#/c/SHORT_ID?status=...` quando Stripe deve fare il redirect.

---

## 11. Test end-to-end LIVE

⚠️ **Attenzione**: in modalità live, ogni carta inserita è reale. La sola tokenizzazione è gratuita, ma se per errore parte un addebito, paghi le commissioni Stripe (1.5% + 0.25€).

### 11.1 Genera un link di test

1. Apri il sito GitHub Pages dall'URL del passo 10.3.
2. Compila il **Setup**: nome ristorante (es. "Trattoria Test"), 2 persone, 25€/persona, 24h.
3. Vai su **Genera link garanzia**: inserisci il **tuo** numero di cellulare (`+39 333...`).
4. Clicca **Genera link garanzia**: vedrai apparire il link Stripe e il messaggio precompilato.
5. Clicca **Invia su WhatsApp**: WhatsApp Web/desktop si aprirà con il messaggio già pronto. Inviati il messaggio.

### 11.2 Apri il link dal telefono

1. Sul tuo cellulare, apri il messaggio WhatsApp e clicca il link.
2. Vedrai la pagina cliente con riepilogo prenotazione e regole.
3. Clicca **Inserisci carta a garanzia**: sarai reindirizzato alla pagina hosted di Stripe.
4. Inserisci la tua carta vera (sì, quella reale — verrà solo tokenizzata).
5. Clicca **Imposta**.
6. Stripe ti rimanderà alla pagina di conferma "Carta registrata".

### 11.3 Verifica lato admin

1. Torna sul desktop dove hai aperto SafeTable.
2. Entro 10-20 secondi (per il polling) lo storico mostrerà la richiesta come **"Carta registrata"** con pallino verde.
3. Apparirà un toast in basso "✓ Carta registrata".

### 11.4 Verifica su Stripe

1. Su Stripe dashboard (modalità Live) → **Pagamenti → Setup intents**: dovresti vedere il record con stato `succeeded`.
2. **Clienti**: dovresti vedere un nuovo cliente Stripe creato con la tua carta salvata.

### 11.5 Test addebito (OPZIONALE — usa importi piccoli)

Se vuoi verificare anche il flusso di addebito penale:

1. Cambia il setup a 1 persona × 1€ (o crea una nuova richiesta con importi minimi — Stripe richiede minimo 0.50€).
2. Genera nuovo link e completa il flusso fino a "Carta registrata".
3. Sullo storico, sulla richiesta confermata, clicca l'icona **€** (rossa).
4. Conferma il prompt "Addebitare 1€...".
5. Entro 5 secondi vedrai un toast "✓ Penale addebitata: 1€" e lo stato passerà a "Penale addebitata" (pallino rosso).
6. Sul tuo conto reale vedrai effettivamente -1€ (più la commissione Stripe). Per riavere indietro l'1€, vai su Stripe → **Pagamenti** → trova il pagamento → **Rimborsa**.

---

## 12. Manutenzione e troubleshooting

### Cache browser dopo aggiornamenti
Quando modifichi `Garanzia CC.html` e pushi su GitHub, il browser potrebbe servire la versione vecchia. Apri **modalità incognito** o premi **F12 → Network → tasto destro su ricarica → Svuota cache e ricarica**.

### Errore "Backend non configurato"
Hai dimenticato di compilare `BACKEND.SUPABASE_URL` o `SUPABASE_ANON` nel file HTML. Vedi passo 9.

### Errore "create-setup-intent" 500
Apri Supabase → **Edge Functions → create-setup-intent → Logs**. Le cause più frequenti:
- `STRIPE_SECRET_KEY` non impostata o scaduta → ripeti passo 6.
- Stripe ha bloccato l'account per attività incompleta → controlla la dashboard Stripe.

### Il webhook non scatta (lo storico resta su "In attesa")
- Vai su Stripe → **Webhook** → controlla che ci siano tentativi recenti.
- Se vedi errori 401/403: il `STRIPE_WEBHOOK_SECRET` è sbagliato. Ripeti passo 8.
- Se non vedi tentativi: l'URL del webhook su Stripe è sbagliato. Verifica che corrisponda esattamente all'URL della function.

### Carta rifiutata in addebito (`charge-cauzione`)
Stripe può rifiutare per vari motivi:
- `card_declined`: carta scaduta, fondi insufficienti, blocco emittente.
- `authentication_required`: la banca chiede 3D Secure off-session. Soluzione: contattare il cliente e chiedere di rifare il setup.
- `expired_card`: carta scaduta dopo la registrazione iniziale.

In tutti i casi il toast in app mostrerà il messaggio dettagliato.

### Aggiornare i segreti
```bash
npx supabase secrets set NOME=nuovo_valore
npx supabase functions deploy NOME_FUNCTION --no-verify-jwt
```

Ricorda **sempre** il redeploy dopo aver cambiato un segreto, altrimenti la function continua a usare il vecchio valore.

### Versioni Stripe SDK
Le 3 functions usano `stripe@12.18.0`. **Non aggiornare** a 14.x: causa errori "event loop" in Deno.

### Costi mensili attesi
- **Supabase**: gratis fino a 500 MB DB e 500K invocations/mese. Bastano per migliaia di richieste.
- **Stripe**: la **registrazione carta è gratis**. Paghi 1.5% + 0.25€ **solo** sugli addebiti penale effettivi (es. 50€ di penale = 0.25 + 0.75 = 1€ di commissione).
- **GitHub Pages**: gratis per repo pubblici, illimitato.

### Backup database
Vai su Supabase → **Database → Backups**: il free tier ha backup giornalieri automatici degli ultimi 7 giorni. Per backup manuali periodici puoi esportare la tabella `cauzioni` come CSV dal Table Editor.

---

## File del progetto

```
safetable/
├── Garanzia CC.html          # Frontend single-file (rinominabile in index.html)
├── CONFIGURAZIONE.md          # Questo file
└── backend/
    ├── README.md              # Guida sintetica
    ├── schema.sql             # Schema database
    └── functions/
        ├── _shared/
        │   └── cors.ts        # Header CORS condivisi
        ├── create-setup-intent/
        │   └── index.ts       # Crea Checkout setup → tokenizza carta
        ├── stripe-webhook/
        │   └── index.ts       # Riceve eventi Stripe → marca confirmed
        └── charge-cauzione/
            └── index.ts       # Addebita penale off-session
```

---

## Promemoria di sicurezza

- ❌ **Mai** committare `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` o `service_role key` nel repo Git.
- ✅ Le chiavi sensibili stanno **solo** nei segreti Supabase (`npx supabase secrets set`).
- ✅ Nel frontend va **solo** la `anon public key` di Supabase (è progettata per essere pubblica, RLS protegge i dati).
- ✅ Se sospetti una chiave compromessa, ruota immediatamente:
  - **Stripe**: dashboard → Sviluppatori → Chiavi API → "Rotate".
  - **Supabase**: dashboard → Project Settings → API → "Reset key".

---

Per qualsiasi dubbio, log da consultare:
- **Edge Functions**: Supabase dashboard → Edge Functions → seleziona function → Logs.
- **Webhook Stripe**: Stripe dashboard → Sviluppatori → Webhook → seleziona endpoint → tab "Tentativi".
- **Frontend**: F12 → Console del browser.

Buon lavoro 🍝
