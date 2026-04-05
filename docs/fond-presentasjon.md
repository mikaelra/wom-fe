# World of Mythos

### Et 3D flerspillerspill med røtter i mytologien

*Presentasjon for fond som støtter små, kreative prosjekter*

---

## 1. Kort om prosjektet

**World of Mythos** er et nettbasert, turbasert flerspillerspill hvor spillerne reiser mellom hellige byer på en 3D-modell av jorden, kjemper mot hverandre rundt et mytisk bord, møter skogens gremliner og slår seg sammen for å beseire bosser som Hades og Ragnaros fra underverdenen.

Spillet er bygget som et lidenskapsprosjekt av et lite team, og kombinerer tilgjengelig nettlesergrafikk med klassiske spillmekanikker inspirert av bordspill og rollespill. Målet er å skape en sosial spillopplevelse som er enkel å hoppe inn i — uten nedlasting, uten installasjon — men som samtidig har nok dybde til å engasjere spillere over tid.

> *[BILDE: Skjermbilde av 3D-verdenskartet med de hellige byene markert]*

---

## 2. Hva gjør spillet unikt?

- **Mytologi i sentrum** — Alt fra byer, fiender og relikvier henter inspirasjon fra gresk, norrøn og annen verdensmytologi.
- **Sosialt og turbasert** — Kampene foregår rundt et felles 3D-bord hvor 2–4 spillere ser hverandres karakterer, chatter i sanntid og planlegger trekkene sine.
- **Kjører i nettleseren** — Ingen nedlasting, ingen app-butikk. Du klikker en lenke og spiller.
- **Ekte skattejakt** — "Artifact Vault"-systemet lar spillere finne koder i den virkelige verden og registrere funnet sitt i spillet.
- **Samarbeid mot bosser** — Planlagte raid hvor spillerne må samarbeide for å beseire mektige motstandere.

> *[BILDE: Kampscene rundt det mytiske bordet med spillerkarakterer]*

---

## 3. Nåværende status

Prosjektet er i en moden prototypefase. Følgende er allerede på plass:

- Fullt spillbar kjerneloop med PvP-lobbyer, turbasert kamp og chat
- 3D-verdenskart med klikkbare byer og animerte karakterer
- Sanntidsserver med støtte for flere samtidige lobbyer
- Gremlin-encounters i en egen skogscene
- Boss-raid mot Hades med nedtellingstimer
- Innlogging, leaderboards og relikviesystem
- Testmiljø deployert til nett (Netlify + Render)

> *[BILDE: Skjermbilde av skogscenen med gremlin og sopper]*

---

## 4. Veien videre — plan frem mot lansering

### Fase 1 — Innhold og polering
- Flere karaktermodeller og animasjoner
- Lyddesign og musikk tilpasset hver scene
- Finpuss av brukergrensesnitt og onboarding for nye spillere
- Utvidet tutorial og regelforklaring

### Fase 2 — Testing og balansering
- Lukket betatest med inviterte spillere
- Balansering av kampmekanikk basert på tilbakemeldinger
- Feilretting og ytelsesoptimalisering på svakere enheter

### Fase 3 — Lansering
- Åpen lansering på nett
- Markedsføring mot spillmiljøer og mytologi-interesserte
- Aktiv community-bygging gjennom chat, leaderboards og jevnlige boss-events

### Fase 4 — Etter lansering
- Flere bosser og raid-typer
- Nye hellige byer og regioner på verdenskartet
- Sesongbaserte events og belønninger

> *[BILDE: Konseptskisse eller skjermbilde som illustrerer en kommende funksjon]*

---

## 5. Hva trengs støtte til?

Midler fra fondet vil gå til:

- **Kunstnerisk innhold** — 3D-modeller, teksturer, musikk og lyd
- **Servere og drift** — Hosting og databaser i test- og lanseringsfasen
- **Testing og QA** — Honorar til betatestere og tilbakemeldingsrunder
- **Lisenser og verktøy** — Utviklingsverktøy og nødvendige tjenester

Prosjektet drives uten kommersielt press, og all støtte går direkte til å gjøre spillet bedre og mer tilgjengelig.

> *[BILDE: Gruppebilde eller illustrasjon av teamet / arbeidsprosessen]*

---

## 6. Teknologi bak spillet

Spillet er bygget med moderne, åpne nettteknologier slik at det kan kjøres direkte i en hvilken som helst moderne nettleser.

**Frontend (det spillerne ser):**
- **Next.js 16** og **React 19** — rammeverk for nettapplikasjonen
- **TypeScript** — for tryggere og mer stabil kode
- **React Three Fiber / Three.js** — 3D-grafikk i nettleseren
- **Tailwind CSS** — stil og layout
- **Netlify** — hosting av nettsiden

**Backend (selve spillmotoren):**
- **Python** med **Flask** — serverlogikk og API
- **Flask-SocketIO** — sanntidskommunikasjon mellom spillere
- **Supabase (PostgreSQL)** — database for spillere, kamper og relikvier
- **Render** — hosting av serveren

**Kommunikasjon:**
- **Socket.IO** sørger for at alle spillere ser oppdateringer umiddelbart — ingen forsinkelser eller manuell oppdatering
- **REST API** håndterer innlogging, lobbyopprettelse og statistikk

Valget av disse teknologiene gjør at spillet er lett å vedlikeholde, rimelig å drifte, og enkelt å utvide med nytt innhold.

---

*Takk for at dere vurderer å støtte World of Mythos.*
