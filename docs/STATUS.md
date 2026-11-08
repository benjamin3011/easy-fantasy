# Stand — 8. Nov 2026

Branch `new`. Der Frontend-Stand davor ist `2136308` (12. Jun 2026, „feat: prepare 2026 season rollout“). Dieser Commit enthält den Betting-Odds-Fix, Node.js 22 als Functions-Runtime und diese Übergabe.

Hosting-Release `live` auf https://easy-fantasy.web.app ist weiter vom 12. Jun 2026, 10:43, Region `europe-west3`. Das Frontend-Bundle enthält die Texte aus `2136308` (`New Season Reset`, `Web Push notifications are enabled.`, Saison `2026`, Start `2026-09-09`). Am 8. Nov 2026 sind nur die Odds-Functions neu deployed, auf Node.js 22: `scheduledUpdateTipsOdds`, `updateTipsOdds`, `scheduledCreateTips`, `createWeeklyTips`, `createLeague`. Die übrigen Functions laufen noch auf Node 20 vom 12. Jun 2026, 10:42–10:43 Uhr. Node 20 lässt sich seit dem 30. Okt 2026 nicht mehr deployen. `.firebase/hosting.ZGlzdA.cache` bleibt lokal und wird nicht committed.

Am 8. Nov 2026 in der eingeloggten Sitzung durchgeklickt, Liga „Die wilden 4“, Woche 9. Nichts gespeichert oder zurückgesetzt.

- `/` zeigt den Spielplan: JAX@BAL final 33–10, CIN@ATL live, übrige Spiele upcoming, eigenes Lineup an den noch nicht angepfiffenen Spielen.
- `/leagues` listet die Liga. Die Detailseite zeigt Standings mit Saison-Totals und Punkten dieser Woche. Der Prophet-Leaderboard für Woche 9 lädt.
- `/lineup` ist 8/8, Captain mit 1.5x, Projektion und Auto-Save-Hinweis sichtbar.
- `/tips` ist 15/15 abgegeben. Beendete und laufende Spiele sind gesperrt und zeigen den Spielstand. Die 50/50-Quoten sind seit dem Fix am 8. Nov 2026, 16:34 Uhr, durch die Betting Odds ersetzt.
- `/profile` zeigt die Push-Einstellungen, auf diesem Gerät als aktiv.
- `/signin` rendert das Formular. `getNFLNews` antwortete mit HTTP 200.

Der Stats-Job schrieb um 15:00 UTC: 2 Boxscores verarbeitet, 13 übersprungen (`Invalid body in box score response`). Das passt zu den zwei bereits laufenden oder beendeten Spielen; die anderen hatten noch keinen Boxscore.

## Fertig und im Code verdrahtet

Im Code verdrahtet, deployed und am 8. Nov 2026 in der eingeloggten Sitzung gesehen, siehe oben. Admin-Aktionen und Schreibwege (Optimize, Clear, Tipps ändern, Settings) wurden nicht ausgelöst.

- Auth: Sign-in, Sign-up, Passwort-Reset, Profil `users/{uid}`. Admin über Custom Claim.
- Ligen: anlegen, per 6-stelligem Code beitreten, öffentlich listen, umbenennen, Sichtbarkeit. Einstellungen für Captain, Weekly Tips, Auto-Lineup, Auto-Tips. Schreiben nur über Callables.
- Lineup: acht Slots, Auto-Save, Usage-Limit 5, Lock pro Anpfiff, Captain. Quick Actions (Optimize, Copy, Random) in `SimpleQuickActions.tsx`.
- Wertung: Stats alle 5 Minuten, Wochen-Scores alle 10 Minuten, Standings aus den Lineup-Totals. Health-Check der Standings plus Admin-Button „Calculate Weekly Scores“.
- Spielplan: Dienstag-Import, Status alle 15 Minuten. Scores in `gameScores`.
- Kader/Teams: täglicher Sync. News über `getNFLNews` / `refreshNFLNews`.
- Weekly Tips / Prophet: Polls, Betting Odds, Ergebnisse, Leaderboard, Repair `repairProphetTotals`. Die Moneyline kommt aus Tank01 `getNFLBettingOdds` (`homeTeamML` / `awayTeamML`).
- Auto-Assistant: fehlende Lineups alle 10 Minuten, fehlende Tipps alle 15 Minuten. Bestehenden Captain lässt er stehen.
- Push: Deadline- und Tips-Erinnerungen, Scoring, Captain-Erfolg. iOS-PWA über Web Push, sonst FCM. Einstellungen unter `/notifications`.
- PWA mit Update-Prompt (`src/sw.ts`, `PWAUpdateNotification`).
- Admin unter `/admin`: Standings, Health, Data, Tips, Notifications, Roles, Mock.
- Home: Spiele, News, Performance- und Captain-Karten. Verletzte im Lineup: `injuryService.ts` plus `InjurySuggestions.tsx` (nur Vorschläge, kein eigener Alert-Job).

## Zuletzt gearbeitet, halb fertig

**12. Jun 2026, Commit `2136308`.** Saison auf 2026 gestellt, schlankes `resetSeasonStandings` (Dry-Run zuerst), Push zusammengezogen: `NotificationSettings.tsx` gelöscht, Registrierung nach `src/services/pushRegistration.ts`, Versand in `functions/src/notifications.ts`, Anzeige in `src/sw.ts`. `src/firebase/firebase.ts` macht nur noch App, Firestore-Persistence und Functions — kein Messaging mehr.

**14. Okt 2026, nur lokal in `docs/season-rollover.md`.** Während der laufenden Saison aufgefallen, dass Saison-Punkte nicht genullt werden. Der strukturelle Fix ist bewusst auf vor Woche 1 / 2027 verschoben. Für 2026 war der Weg ein einmaliger Admin-Repair, kein Code-Change.

**8. Nov 2026.** Der Repair ist gelaufen. `players.seasonFantasyPoints` und `teams.seasonFP_*` sind die 2026er-Totals, die PPG dafür ist brauchbar. Nicht noch einmal ausführen, außer nach einem Stats-Reprocess (siehe Bugs).

Halb fertig daneben:

- Preseason existiert nur im Backend (`CURRENT_SEASON_TYPE`, API-Week-Offset). Das Frontend erzwingt Regular Season.
- `sendInjuryAlert` und `sendAchievementAlert` sind Callables plus Test-Buttons im Admin. Es gibt kein Achievement-System und keinen Job, der Verletzten-Alerts aus echten Daten schickt. Defaults in den Preferences: beide aus.
- `public/firebase-messaging-sw.js` liegt lokal, ist gitignored und wird von keinem Source-File registriert. Push hängt an `/sw.js`.
- `firestore.indexes.json` ist leer. In Produktion stehen acht Indexes, alle `READY`: `leagues` (`isPublic`+`createdAt`, `memberUids` CONTAINS+`createdAt`) und `weeklyLineups` (Collection und Collection-Group auf `leagueId`/`season`/`week`, `isComplete`+`week`, `totalActualPoints`+`week`). Die Datei ist nicht die Quelle dieser Indexes. `firebase deploy` für Indexes würde sie löschen.
- `systemHealthCheck` ist angebunden, die Wochenauswahl darin ist hart auf 15 kodiert (siehe Bugs).

## Offene TODOs

**P1 — nicht anfassen, bis 2026 vorbei ist**

1. `repairSeasonFantasyPoints` für 2026 ist durch. Aggregation und PPG-Anzeige nicht umbauen, den Repair nicht wiederholen.
2. Vor Woche 1 / 2027: die drei Punkte aus `docs/season-rollover.md` (Saison-Stempel und Nullen, keine `/17`- und Vorjahres-Fallbacks, Saisonjahr an den Roster-Request).

**P2 — echte Code-Schulden**

3. `functions/src/admin.ts`: `currentWeek = 15` in `checkScoreIntegrity` und `checkMissingDerivedFields`. Am 8. Nov 2026 ist Woche 9, der Check schaut auf Wochen ≥ 13. Der Kommentar sagt selbst „TODO: Get from current week helper“.
4. Dieselbe Prüfung nimmt Captain-Multiplikator × 2 an. Ligen dürfen 1–3, Default 1.5. Das erzeugt Fehlalarme, sobald der Check die richtigen Wochen sieht.
5. Saison-Konstanten an drei Stellen synchron halten. Siehe `AGENTS.md`.

**P3 — aufräumen, wenn jemand drin ist**

6. Ungenutzte Dependencies (Liste in `AGENTS.md`).
7. `README.md` ist das Vite-Template.
8. Auskommentierte Alternative `scheduledUpdateGameStatusesAPI` in `functions/src/scheduleSync.ts` (Kommentar: „TODO: Alternative scheduled function using Tank01 live detection“).
9. Widerspruch nur im Kommentar von `calculatePassingOffensePoints`: Text sagt „4 points“, der Code multipliziert mit 6. Die API-Parameter nutzen ebenfalls `passTD: '6'`. Nicht „auf 4 korrigieren“, ohne die Regel zu wollen.

Die Roadmap-Dateien nicht als Backlog abarbeiten. Vieles davon (Weather, Achievements, Multi-Sport, Social) ist nie gebaut worden.

## Bekannte Bugs und Workarounds

**Saison-Punkte laufen über den Jahreswechsel weiter.** `statsSync` erhöht `players.seasonFantasyPoints` und `teams.seasonFP_Passing|Rushing|Defense|ST` nur per `FieldValue.increment`. Ein neues Jahr setzt sie nicht auf 0. `dataSync` überschreibt `gamesPlayed` aus der aktuellen Saison und lässt die Totals stehen. PPG im Client ist `Saisonpunkte / gamesPlayed` (`src/services/lineupFetchingService.ts`).

Beobachtung vom 14. Okt 2026, vor dem Repair, in `docs/season-rollover.md`: Josh Allen 114.12 PPG, weil 570.58 Punkte (2025+2026) durch 5 Spiele geteilt wurden; nur 2026 wären 155.96 / 5 = 31.19. Arizona, Denver, Detroit damals mit 17 Spielen aus 2025 plus Wochen 1–5 / 2026. Diese Zahlen sind historisch. Seit dem Repair (bestätigt 8. Nov 2026) stimmen die Root-Totals für 2026.

Workaround, bereits ausgeführt: Callable `repairSeasonFantasyPoints`, UI unter `/admin/data`. Sie schreibt die Root-Totals aus `gamestats` mit `season == 2026` neu und löscht keine Game-Docs. Ein zweites Mal nur nach einem Stats-Reprocess: Unveränderte Punkte werden nicht erneut aufaddiert, das `season`-Feld am Game-Doc wird aber überschrieben. Der Lauf geht Spieler für Spieler, je eine Query, Timeout 540 s. Er ist durchgekommen.

**PPG-Fallbacks, wenn `actualPPG` 0 ist.** `SimpleQuickActions.tsx` und `functions/src/autoAssistant.ts` (`getEffectivePPG`) nehmen dann Tank01-`rawSeasonStats` bzw. `seasonFP_* / 17`, sonst Positions-Defaults (QB 18, RB 12, WR 10, TE 8) oder Win-Prozent. Der Roster-Request in `fetchTeamRosterFromApi` übergibt kein Saisonjahr. Für Entities mit Spielen in 2026 ist `actualPPG` nach dem Repair gesetzt, die Fallbacks greifen dort nicht. Stehen lassen bis zum 2027er-Fix.

**Health-Check Woche 15 und Captain × 2.** Siehe P2. Der Check ist in Woche 9 praktisch blind.

**Tipps-Quoten 50/50, behoben am 8. Nov 2026.** `scheduleSync` legt Polls mit 50/50 an. `scheduledUpdateTipsOdds` sollte das aus `getNFLBettingOdds` überschreiben, las aber `homeTeamMLOdds` statt `homeTeamML` / `awayTeamML`, warf `reading 'replace'` und schrieb nichts. Dieselbe Exception stand in den Logs seit mindestens dem 31. Okt 2026. Die Berechnung liegt jetzt in `functions/src/bettingOdds.ts`, Books ohne gültige Moneyline werden übersprungen. Deployed auf Node.js 22, weil Node 20 seit dem 30. Okt 2026 nicht mehr deploybar ist. Der Job lief am 8. Nov 2026 um 15:34 UTC durch. Auf `/tips` stehen danach echte Quoten, die 15 abgegebenen Tipps sind unverändert. Die übrigen Functions laufen weiter auf Node 20, bis sie selbst neu deployed werden.

## Entscheidungen

- **12. Jun 2026 — Saison 2026 ohne Datenmigration im Code.** Commit-Text: App auf 2026, schlankes Standings-Reset, Push so zusammenziehen, dass die private Liga sauber starten kann. `resetSeasonStandings` nullt nur die Mitglieder-Totals in `leagues`, nicht die Spieler-`seasonFantasyPoints`. Deshalb das spätere PPG-Problem.
- **12. Jun 2026 — ein Service Worker.** Push landet in `src/sw.ts`. iOS-Standalone bekommt Web Push (VAPID), alle anderen FCM, weil iOS kein FCM im PWA-Webview zuverlässig kann (`isIosStandalonePwa`).
- **14. Okt 2026 — kein Hotfix an der Aggregation.** Stattdessen einmal `repairSeasonFantasyPoints`. Code-Fix erst zum 2027er-Wechsel, damit die laufende Saison nicht ein zweites Mal die Totals verschiebt. Quelle: `docs/season-rollover.md`.
- **8. Nov 2026 — Repair ist gelaufen.** Die 2026er-Root-Totals sind damit die gültigen Saisonpunkte. Grund: PPG und Auto-Assistant sollen den Rest der Saison mit 2026er-Werten rechnen, ohne den Aggregationscode anzufassen.
- **Spielerpunkte kommen von Tank01, Team-Einheiten nicht.** Kommentar in `statsSync.ts`: die API rechnet mit den mitgeschickten Parametern, der Client speichert `fantasyPoints`. Team-DST/Offense rechnet `pointsCalculator.ts`, weil die API das nicht in dieser Slot-Form liefert.
- **Client schreibt keine Ligen.** Rules `allow create, update, delete: if false` auf `leagues`. Bewusst so gelassen, Logik liegt in `functions/src/leagues.ts`.
- **Lineup-Lock pro Spiele.** Nicht eine Liga-Deadline für alle Slots. Wer schon angepfiffen ist, bleibt.

## Nächste Schritte

1. `AGENTS.md` und `docs/season-rollover.md` lesen, bevor Scoring, PPG oder Saison-Konstanten angefasst werden. Den Repair nicht erneut starten.
2. Wenn doch ein Bugfix in dieser Saison: zuerst der hart kodierte `currentWeek = 15` und der angenommene Captain-Faktor 2 in `functions/src/admin.ts`. Das ändert keine gespeicherten Punkte.
3. Den 2027-Fix (Saison-Stempel, Fallbacks raus, Saisonjahr im Roster-Call) erst planen, wenn 2026 vorbei ist.
