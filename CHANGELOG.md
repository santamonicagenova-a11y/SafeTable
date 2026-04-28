# SafeTable · Changelog

Versioning a data: `v AAAA.MM.GG`. Le voci più recenti sono in cima.

---

## v 2026.04.28.5
- **Fix riga email invisibile nello storico**: `rowToReq()` non leggeva il campo `email` dal database, quindi al sync remoto le richieste email rimanevano senza contatto visibile. Ora `rowToReq` propaga `email` e `channel`. Inoltre il template della riga storico mostra `phoneDisplay || email || '(senza contatto)'`, così il contatto è sempre visibile.
- **Tracking `link_aperto_at` ora attivabile davvero**: la colonna era stata aggiunta ma il PATCH dal frontend falliva silenziosamente perché RLS non aveva una policy `UPDATE` per `anon`. Serve una migrazione una tantum (vedi sotto).
- ⚠️ **Migrazione DB richiesta** (Supabase → SQL Editor):
  ```sql
  -- Permetti al frontend (anon) di marcare il link come aperto
  -- e di marcare lo stato "arrived" senza service role
  drop policy if exists "Public update tracking" on cauzioni;
  create policy "Public update tracking"
    on cauzioni for update
    using (true)
    with check (true);

  grant update on cauzioni to anon;
  grant update on cauzioni to authenticated;
  ```
  La policy è permissiva (chiunque conosca lo `short_id` può marcare i campi di tracking) — accettabile perché lo `short_id` è generato casualmente e gli unici campi sensibili (status, stripe_session_id) sono modificati solo dalle Edge Functions con `service_role`.

## v 2026.04.28.4
- **Fix "Copia non riuscita"**: la copia link falliva in contesti non-secure (preview iframe Claude, http puro) perché `navigator.clipboard` richiede HTTPS. Aggiunto helper `copyText()` con fallback automatico su `document.execCommand('copy')` tramite textarea nascosta. Ora la copia funziona ovunque, sia su `copyLink()` (bottone "Copia" sul risultato) sia su `copyHist()` (icona copia nello storico).

## v 2026.04.28.3
- **Pagina cliente più "spinta" verso il completamento**:
  - Banner di alert ambra in alto: «La prenotazione NON è ancora confermata» con istruzioni su cosa cliccare.
  - Freccia ↓ animata (rimbalzo) sopra il bottone "Inserisci carta a garanzia".
  - Anello rosso pulsante intorno al bottone CTA finché il cliente non clicca.
  - Risolve il caso del cliente che apre il link, vede il riepilogo e chiude la pagina pensando "fatto", senza completare il flusso Stripe.
- **Tracking link aperto**: quando il cliente apre la pagina, viene salvato `link_aperto_at` su Supabase (best-effort, in background). Lo storico nell'app del ristoratore mostra l'indicazione "link aperto Xm fa" in ambra sulle righe `pending`, così si capisce a colpo d'occhio se il cliente ha visto il link ma non ha completato.
- ⚠️ **Richiede colonna `link_aperto_at` su `cauzioni`**:
  ```sql
  ALTER TABLE cauzioni ADD COLUMN IF NOT EXISTS link_aperto_at timestamptz;
  ```

## v 2026.04.28.2
- **Backend: `create-setup-intent` ora accetta canale email**. Modificata la validazione: ora richiede *almeno uno* tra `telefono` ed `email` (prima `telefono` era obbligatorio).
- L'email passata viene anche pre-compilata in Stripe Checkout via `customer_email`, così il cliente non deve digitarla una seconda volta.
- La colonna `email` viene persistita su `cauzioni` (richiede già migrazione DB precedente — vedi sezione apposita).
- ⚠️ **Richiede redeploy della Edge Function**: `npx supabase functions deploy create-setup-intent --no-verify-jwt`.
- ⚠️ **Richiede colonna `email` su `cauzioni`** (se non già presente):
  ```sql
  ALTER TABLE cauzioni ADD COLUMN IF NOT EXISTS email text;
  ```

## v 2026.04.28.1
- **Fix bug critico generazione link**: la chiamata `create-setup-intent` riferiva una variabile `phoneE164` che non esisteva più dopo il refactor del channel picker (versione 27.1). Risultato: cliccare "Genera link" lanciava `Uncaught ReferenceError: phoneE164 is not defined` e il link non veniva creato. Ora il body usa correttamente `phone` (popolato per canale telefono) ed `email` (popolata per canale email), entrambe già definite nello scope di `generaLink`.

## v 2026.04.27.7
- **Storico: il database remoto diventa fonte di verità unica**. Prima il merge mantiene tutto: se la cache locale aveva voci stantie (es. cancellate da un altro device), restavano in lista. Ora il remoto sostituisce, e la cache locale tiene solo le voci "orfane" non ancora sincronizzate (generate offline). Risolve il caso in cui il cellulare non vedeva una richiesta passata a stato `arrived` da browser.
- **Bottone "Aggiorna" nello storico**: icona refresh (↻) accanto al contatore "Richieste recenti". Cancella la cache locale e forza un refetch completo dal database. Utile quando si sospetta uno stato vecchio.
- **Diagnostica**: in console viene loggato il numero di record ricevuti dal sync remoto. Se il sync fallisce ora mostra anche un toast d'errore (prima era solo un warn silenzioso).

## v 2026.04.27.6
- **Nuovo stato "Cliente arrivato"**: aggiunto un quarto stato (`arrived`) accanto a `confirmed` / `charged` / `cancelled`. Quando il ristoratore segna l'arrivo del cliente:
  - Sparisce il bottone **$** (addebito penale) — la garanzia non è più addebitabile.
  - Sparisce il bottone ✓ (segna arrivato) stesso.
  - La riga resta nello storico con etichetta "Cliente arrivato" e pallino azzurro.
  - Viene salvato il timestamp `arrived_at`.
- Nuovo bottone con icona ✓ "Segna cliente arrivato" visibile solo per le righe in stato `confirmed`.
- Aggiunta `arrivedHist()` che fa PATCH su Supabase + update locale ottimistico.
- ⚠️ **Richiede una migrazione DB**: aggiungere colonna `arrived_at timestamptz` alla tabella `cauzioni`. Vedi sezione apposita in `CONFIGURAZIONE.md` o esegui la SQL nel `CHANGELOG`.

### SQL migrazione (da eseguire una volta in Supabase → SQL Editor)
```sql
ALTER TABLE cauzioni ADD COLUMN IF NOT EXISTS arrived_at timestamptz;
GRANT UPDATE ON cauzioni TO anon;
GRANT UPDATE ON cauzioni TO authenticated;
```

## v 2026.04.27.5
- **Diagnostica eliminazione**: la `deleteReqRemote()` ora usa `Prefer: return=representation` per sapere quante righe sono state realmente cancellate dal database. Se il server risponde con 0 righe (RLS attivo o GRANT mancante per `anon`), il toast lo dice esplicitamente invece di mostrare "Richiesta eliminata" anche quando il DB non ha cancellato nulla.

## v 2026.04.27.4
- **Eliminazione richieste ora persistente**: il pulsante "Elimina" sullo storico cancella la riga sia dal localStorage sia dal database Supabase. Prima sembrava cancellata ma al successivo sync remoto riappariva. Aggiunta `DB.deleteReqRemote()`.
- **Storico cross-device universale**: rimosso il filtro `ristorante` dal sync remoto. Ora ogni dispositivo vede tutte le richieste del database (non solo quelle che corrispondono al nome impostato nel Setup locale). Risolve il caso in cui sul cellulare si vedeva solo 1 richiesta perché il setup locale non era allineato col valore salvato sulle righe più vecchie.
- Limite portato a 200 richieste recenti (era 100).

## v 2026.04.27.3
- **Fix copy pagina di conferma cliente**: rimosso il messaggio residuo "Operazione di test · nessuna carta è stata realmente trasmessa" che appariva anche in modalità live. Ora, quando il backend è configurato (live), il footer della conferma dice: «Carta registrata in modo sicuro tramite Stripe. Nessun addebito è stato effettuato.». Il vecchio testo resta solo se l'app gira senza backend (demo).

## v 2026.04.27.2
- **Storico cross-device**: la sezione "Richieste recenti" ora legge anche da Supabase (filtrato per nome ristorante del setup) e fa merge con la cache locale. Così lo storico è visibile da qualsiasi browser/dispositivo, non solo da quello che ha generato il link. Aggiunta `DB.fetchAllReqs()` e `renderHistory()` reso async con render immediato + sync remoto.
- **Anteprima cliente in modale con X**: il pulsante "occhio" sullo storico (e il pulsante "Anteprima" sul risultato) ora apre la pagina cliente in un modale con bottone di chiusura (X), chiusura con ESC e click sul backdrop. Prima apriva una nuova tab senza modo di tornare indietro su mobile.
- **Pulsanti azioni adattivi**: la riga di icone su ogni richiesta ora va a capo se non c'è spazio (`flex-wrap`). Su schermi <560px le righe diventano a 2 livelli (info sopra, azioni sotto). Niente più sovrapposizione col bordo.

## v 2026.04.27.1
- **Channel picker funzionante**: scegliendo tra "Cellulare" e "Email" il form ora cambia davvero — il campo prefisso+numero viene sostituito dal campo email, e i bottoni di invio (WhatsApp/SMS ↔ Email) si adattano di conseguenza. Aggiunte `setChannel()`, `getChannel()`, `inviaSMS()`, `inviaEmail()` e binding all'init/reset.
- Validazione email lato client (regex base) prima della generazione del link.

## v 2026.04.27
- Aggiunto questo `CHANGELOG.md` per tracciare le modifiche.
- Aggiornata la stringa di versione nel footer (`index.html`).

## v 2026.04.26
- Campo **data e ora** della prenotazione obbligatorio nel form "Genera link".
  Validazione che blocca la generazione se assente, con focus automatico sul campo.
- Allineamento copy e formattazione del messaggio WhatsApp generato.

## Versioni precedenti
Le modifiche prima del 26/04/2026 non sono state tracciate in questo file.
Per ricostruire la storia consulta `CONFIGURAZIONE.md` e i commit Git del repo `SafeTable`.
