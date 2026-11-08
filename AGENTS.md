# Easy Fantasy — Agenten-Kontext

Stabile Fakten. Aktuellen Stand, Bugs und nächste Schritte: `docs/STATUS.md`.
Saisonwechsel-Details: `docs/season-rollover.md`.

`.cursor/rules` ist ein leeres Verzeichnis. Eine `.cursorrules` gibt es nicht. Es gab keine Projektregeln zum Übernehmen. `README.md` ist noch das Vite-Template und beschreibt die App nicht. `PRODUCT_ROADMAP.md` und `PRODUCT_ROADMAP_2025.md` (Stand Juli 2025) sind Ideensammlungen, keine Spezifikation.

## Zweck

Easy Fantasy ist eine kleine private NFL-Fantasy-Liga als installierbare Web-App. Jede Woche setzt man acht Slots: vier Spieler (QB, RB, WR, TE) und vier Team-Einheiten (Passing Offense, Rushing Offense, Defense, Special Teams). Es gibt keinen Draft und keine Waiver.

Ein Captain multipliziert die Punkte eines Slots (Liga-Einstellung, 1–3, Default beim Anlegen 1.5). Jede Entity darf pro Liga und Saison fünfmal gewählt werden. Dazu kommen Wett-Tipps („Prophet“) auf die Spiele der Woche. Punkte, Spielpläne und Kader kommen von der Tank01-NFL-API über Cloud Functions.

## Tech-Stack

Zwei getrennte npm-Projekte. Versionen sind die installierten aus den Lockfiles (8. Nov 2026).

**Frontend** (`package.json`, Node lokal 20.19.1, nicht gepinnt):

| Paket | Version |
|---|---|
| React / React DOM | 19.1.0 |
| TypeScript | 5.7.3 (`strict`, `noUnusedLocals`, `noUnusedParameters`) |
| Vite | 6.3.2 |
| Tailwind CSS | 4.1.4, über `@tailwindcss/postcss` |
| React Router | 7.5.1 (`react-router`, nicht `react-router-dom`) |
| Firebase JS | 10.14.1 |
| TanStack Query | 5.83.0 |
| Zustand | 5.0.6 |
| Sentry `@sentry/react` | 9.32.0 |
| vite-plugin-pwa | 1.0.0 |
| ESLint | 9.25.1 |

**Functions** (`functions/`, `"node": "22"`, eigener TypeScript):

| Paket | Version |
|---|---|
| firebase-functions | 6.3.2 (v2 API) |
| firebase-admin | 13.3.0 |
| TypeScript | 4.9.5, Target `es2017`, `module` `NodeNext` |
| Cloud Functions Runtime | Node.js 22 (`functions/package.json` engines). Node 20 ist seit 30. Okt 2026 stillgelegt und lässt sich nicht mehr deployen. Bereits laufende Functions bleiben auf Node 20, bis sie neu deployed werden. |
| axios | 1.9.0 |
| `@aws-sdk/client-sesv2` | 3.799.0 |
| web-push | 3.6.7 |

Firebase CLI auf diesem Rechner: 14.2.2 (`firebase --version`, 8. Nov 2026), nicht in `package.json` gepinnt. Andere Rechner können eine andere CLI haben.

Im Frontend installiert, im `src/`-Code aber nicht importiert: `immer`, `@tanstack/react-query-persist-client`, `@sentry/tracing` (v7, neben Sentry v9), `@types/firebase`. In Functions installiert, in `functions/src` nicht importiert: `@google-cloud/storage`. `firebase-functions-test` ist da, Testdateien gibt es keine.

## Architektur

```
src/                  React-PWA
  pages/              Routen, Admin unter pages/Admin
  components/         UI nach Feature (lineup, leagues, gamecenter, …)
  store/              Zustand: lineupStore, tipsStore
  context/            Auth, League, Header, Theme, Sidebar, LineupPoints
  hooks/              u. a. useLineupQueries (Query-Keys)
  services/           Firestore-Reads und Domänenlogik im Client
  firebase/           App-Init und httpsCallable-Wrapper
  config/             Saison, Slots, Sentry
  sw.ts               Workbox-Service-Worker plus Push-Handler
functions/src/        eine Datei pro Domäne, alles aus index.ts re-exportiert
firestore.rules       Client-Schreibrechte
firebase.json         Hosting-Site easy-fantasy, Functions-Region europe-west3
```

Firestore-Projekt und Hosting-Site: `easy-fantasy` (`.firebaserc`, `firebase.json`). Alle Functions laufen in `europe-west3`. Der Client holt Functions immer mit `getFunctions(app, 'europe-west3')`.

**Spielregeln im Code**

- Slots: `src/config/positions.ts`. Dieselben acht Keys validiert `saveWeeklyLineup`.
- Spielerpunkte schreibt Tank01. `functions/src/statsSync.ts` schickt die Scoring-Parameter mit (`passYards` 0.04, `passTD` 6, `rushYards`/`receivingYards` 0.1, `rushTD`/`receivingTD` 6, Interceptions und Fumbles −2, PPR 0). Gespeichert wird `fantasyPoints` der API, keine eigene Spielerformel.
- Team-Einheiten rechnet `functions/src/pointsCalculator.ts` lokal (Passing-TD dort ebenfalls × 6).
- Usage-Limit 5, Konstante doppelt: `MAX_USAGE_COUNT` in `src/config/appConfig.ts` und `functions/src/lineupProcessing.ts`.
- Lock ist pro Entity: Sobald `gameTime_epoch` des eigenen Spiels ≤ jetzt ist, darf dieser Slot nicht mehr wechseln.
- Saison überall `"2026"`, Regular Season. Wochenstart Mittwoch, 9. Sept 2026. Woche = Mittwoch–Dienstag, 1–18. Dieselbe Formel in `functions/src/common.ts` und `src/utils/nflWeekHelper.ts`.

**Dokument-IDs (die Rules parsen sie)**

| Pfad | ID |
|---|---|
| `users/{uid}/weeklyLineups/{id}` | `{leagueId}_{season}_{week}` |
| `users/{uid}/leagueUsage/{id}/usageCounts` | `{leagueId}_{season}` |
| `nfl_schedules/{id}` | `{season}_week_{week}` |
| `weeklyTips/{id}` | `{leagueId}_week_{week}_season_{season}` |

`extractLeagueIdFromLineupId` / `extractLeagueIdFromTipsId` nehmen das erste Segment vor `_`. Liga-IDs sind Firestore-Auto-IDs ohne Unterstrich. Eigene IDs mit `_` würden die Rules falsch aufteilen.

**Wer schreibt**

- Client liest Spieler, Teams, Spielpläne, Scores. Schreiben an `leagues`, `players`, `teams`, `gameScores`, `weeklyTips`, `prophetStandings` ist in den Rules verbaut und läuft über Callables.
- Ausnahme: Admins (`request.auth.token.admin === true`) dürfen `players|teams/*/gamestats` und `nfl_schedules` direkt schreiben. Das nutzt `/admin/mock`.
- `users/{uid}` und die eigenen `weeklyLineups` darf der Client laut Rules selbst schreiben. Der normale Weg für Lineups ist trotzdem die Callable `saveWeeklyLineup` (Lock, Usage, Transaction).
- Admin-Claim setzt nur die Callable `addAdminRole`.

**State**

- Serverdaten, die mehrere Screens teilen: TanStack Query. Keys für Lineups in `src/hooks/useLineupQueries.ts`. Defaults in `src/main.tsx`: `staleTime` 15 Minuten, `gcTime` 7 Tage, kein Refetch beim Fokus, drei Retries, keine Retries wenn die Fehlermeldung ein `"4"` enthält.
- Der offene Lineup-Editor ist Zustand (`useLineupStore`), inkl. Auto-Save und einer Offline-Queue. Tipps: `useTipsStore`.
- Auth, aktuelle Liga/Woche, Theme, Header: React Context.
- Firestore-Offline: `enableMultiTabIndexedDbPersistence` in `src/firebase/firebase.ts`.
- Es gibt keinen Query-Persister, obwohl das Paket installiert ist.

**Fehler**

- Functions: `HttpsError` mit `unauthenticated`, `permission-denied`, `invalid-argument`, `failed-precondition`, `not-found`, `internal`. Logging über `firebase-functions/v2` `logger`.
- UI: `react-hot-toast` für Aktionen. Seitenfehler: eigene Klasse `src/components/common/ErrorBoundary.tsx` (umschließt `App`, schickt an Sentry). Query-Inseln: `QueryBoundary` (`QueryErrorResetBoundary` + `react-error-boundary`).
- Sentry initialisiert immer (`src/config/sentry.ts`). Ohne `VITE_SENTRY_DSN` bleibt der DSN leer.

**Schedules (Auszug)**

| Function | Takt | Zeitzone |
|---|---|---|
| `scheduledGameStatsAndScoresSync` | alle 5 Min | Europe/Berlin |
| `scheduledCalculateWeeklyScores` | alle 10 Min | Europe/Berlin |
| `checkAutoLineups` | alle 10 Min | America/New_York |
| `scheduledUpdateGameStatuses` | alle 15 Min | America/New_York |
| `checkLineupDeadlines`, `checkTipsReminders`, `refreshNFLNews` | alle 15 Min | Europe/Berlin |
| `scheduledUpdateTeamsAndPlayers` | alle 24 h | Europe/Berlin |
| `scheduledFetchWeeklySchedule` | Di 03:00 | Europe/Berlin |
| `scheduledCreateTips` | Di 10:00 | America/New_York |

## Konventionen

- Keine Path-Aliase. Imports sind relativ.
- Dateien: Pages und Komponenten PascalCase, Hooks `use…`, Callables im Client `…Callable`, Cloud-Function-Export = Name, den `httpsCallable` aufruft.
- Neue Backend-Logik in die bestehende Domänendatei (`leagues.ts`, `lineupProcessing.ts`, …) und aus `functions/src/index.ts` re-exportieren. Region nicht pro Function neu erfinden; Options aus `functions/src/config.ts` spreaden (`functionOptions`, `statsSyncOptions`, …).
- Secrets nur über `defineSecret(...).value()` zur Laufzeit, nie ins Repo.
- Saison nicht nur an einer Stelle ändern. Dieselben Werte stehen in `src/config/appConfig.ts` (`APP_CONFIG` und noch einmal als lose Exports), `functions/src/config.ts` und `src/utils/nflWeekHelper.ts` (Start-Datum und Week-Formel). Das Frontend-Helfer kennt Preseason nicht: `isPreseason()` gibt fest `false` zurück. Preseason hängt nur am Backend (`CURRENT_SEASON_TYPE`, Stand `"reg"`).
- Tailwind v4: Tokens in `src/index.css` unter `@theme`. Dark Mode über die Klasse `.dark` (`@custom-variant dark`).
- SVG-Icons als React-Komponenten über `vite-plugin-svgr` (`exportType: 'named'`, `ReactComponent`).
- PWA: `injectManifest`, Quelle `src/sw.ts`, `injectRegister: false`. Registrierung steht von Hand in `src/main.tsx`. Update-Prompt, nicht Auto-Reload.
- Arbeitsbranch ist `new` (`origin/new`). `master` steht auf `a209869` (Mai 2025, „start with lineup processing“) und ist nicht der aktuelle Stand.

## Befehle

Zwei Installationen:

```bash
npm install
npm install --prefix functions
```

| Aufgabe | Befehl |
|---|---|
| Dev-Server | `npm run dev` — Vite, Port **4173**, Host `0.0.0.0` |
| Build | `npm run build` — `tsc -b && vite build`, Output `dist/` |
| Preview | `npm run preview` |
| Lint Frontend | `npm run lint` — `eslint .` (ignore nur `dist`) |
| Lint Functions | `npm --prefix functions run lint` |
| Build Functions | `npm --prefix functions run build` — `tsc` nach `functions/lib` |
| Functions-Emulator | `npm --prefix functions run serve` — nur Functions |
| Deploy Hosting | `npm run deploy` oder `npm run deploy:hosting` |
| Deploy Functions | `npm run deploy:functions` — predeploy lintet und baut Functions |
| Deploy alles | `npm run deploy:all` |

Tests: kein `test`-Script, keine `*.test`/`*.spec`-Dateien.

Deploy trifft das Firebase-Projekt `easy-fantasy`. Hosting ist eine SPA (`**` → `/index.html`). JS/CSS bekommen `Cache-Control: immutable`.

## Externe Dienste und Konfiguration

Keine Werte hier eintragen. Lokal liegen sie in `.env` (gitignored). Functions-Secrets liegen in Firebase Secret Manager.

**Client-Variablen**

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY` — FCM
- `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` — Web Push, iOS-Standalone-PWA
- `VITE_FN_BASE` — Callable-HTTP-Basis. Lokal dokumentiert als `http://localhost:5001/easy-fantasy/europe-west3`, Produktion `https://europe-west3-easy-fantasy.cloudfunctions.net`. Ohne Variable fällt `src/utils/api/http.ts` auf `/api` zurück. News nutzt das (`GET /getNFLNews`).
- Sentry, nur wenn gesetzt: `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_RELEASE`, `VITE_SENTRY_TRACES_SAMPLE_RATE`, `VITE_SENTRY_ENABLE_TRACING`, `VITE_SENTRY_ENABLE_REPLAY`, `VITE_APP_VERSION`, `VITE_BUILD_TIME`. Doku: `SENTRY_SETUP.md`. In der lokalen `.env` fehlen diese Keys. Das live Bundle vom 12. Jun 2026 enthält das Sentry-SDK, aber keinen DSN: `initializeSentry` bricht mit „Sentry DSN not provided“ ab. Error-Monitoring ist in diesem Build aus.

**Firebase-Secrets** (`functions/src/config.ts`)

`TANK01_KEY`, `AWS_SES_KEY_ID`, `AWS_SES_KEY_SECRET`, `AWS_SES_REGION`, `MAIL_FROM`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`.

**Dienste**

- Tank01 über RapidAPI, Host `tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com`. Kader, Boxscores, Spielplan, News, Wettquoten.
- Firebase Auth (E-Mail/Passwort), Firestore, Cloud Functions, Hosting, Cloud Messaging.
- AWS SES v2 für Liga-Mails (`mailLeagueCreated`, `mailLeagueJoined`).
- Sentry im Frontend, siehe oben.
- Web Push (VAPID) zusätzlich zu FCM. iOS als installierte PWA nimmt Web Push, sonst FCM (`src/services/pushRegistration.ts`). Beides hängt am Service Worker aus `src/sw.ts`.

## No-Gos

- `.env`, `*.pem` und `public/firebase-messaging-sw.js` nicht committen (alle drei stehen in `.gitignore`). Die PEM-Dateien sind lokale Dev-Zertifikate; HTTPS im Vite-Server ist auskommentiert.
- `.firebase/hosting.ZGlzdA.cache` nicht mitcommitten. Die Datei ist lokal geändert und nur ein Hosting-Cache.
- Scoring-Parameter in `statsSync.ts` und Formeln in `pointsCalculator.ts` nicht „nebenbei“ anpassen. Bereits gespeicherte `gamestats.fantasyPoints` bleiben alt, Saison-Totals sind Inkremente.
- Dokument-ID-Formate nicht ändern, ohne `firestore.rules` und alle Parser (`split('_')[0]`) mitzuziehen.
- `europe-west3` nicht nur serverseitig ändern. Jeder `getFunctions`-Aufruf im Client muss mit.
- `CURRENT_NFL_SEASON` und `SEASON_START_DATE_REF` nicht nur in einer der drei Stellen ändern.
- `resetSeasonStandings` nicht ohne Dry-Run ausführen. Default ist Dry-Run (`dryRun !== false`). Ein echter Lauf setzt `members[].weeklyPoints` auf `{}` und `totalSeasonPoints` auf 0, für eine Liga oder für alle.
- `/admin/mock` nicht gegen Produktion benutzen, außer das ist ausdrücklich gewollt. Es schreibt Spielzeiten und `gamestats` direkt.
- Die Saison-Punkte-Totals (`players.seasonFantasyPoints`, `teams.seasonFP_*`) bis zum 2027er-Wechsel nicht umbauen und `repairSeasonFantasyPoints` nicht erneut ausführen. Der Repair für 2026 ist gelaufen, die Root-Totals sind die gültigen 2026er-Punkte. Nochmal nur nach einem Stats-Reprocess. Begründung in `docs/season-rollover.md`, Stand in `docs/STATUS.md`.
- `firestore.indexes.json` nicht deployen, solange die Datei leer ist. Produktion hat acht Composite Indexes, die nur in der Cloud stehen. Ein Index-Deploy löscht, was nicht in der Datei steht. Liste in `docs/STATUS.md`.
- Nicht auf `master` arbeiten und `master` nicht als Basis nehmen. Der Branch `new` ist der Stand.
