# Direkte Firestore-Zugriffe des Clients

Stand: Branch `bot/t_b2a367bd660f1d9f`, Commit `90452be` (18. Nov 2026). Quelle: Durchsicht von `src/` (Suche nach `setDoc`, `updateDoc`, `addDoc`, `deleteDoc`, `writeBatch`, `runTransaction`, `getDoc`, `getDocs`, `onSnapshot`, `collection(`, `doc(`) und `firestore.rules`. Nichts wurde ausgeführt oder geändert; die Regeln wurden nur gelesen, nicht im Emulator getestet.

Kurzbefund: Der Client schreibt **nicht** direkt in `weeklyLineups`, `leagueUsage/usageCounts` oder `weeklyTips/userTips`. Lineups laufen über `saveWeeklyLineup`, Tipps über `submitTips` (Callables). Die Regeln erlauben diese Schreibzugriffe trotzdem (siehe Abschnitt 5).

## 1. Schreibzugriffe in `src/`

`addDoc` und `runTransaction` kommen im aktuellen `src/` nicht vor. Weitere Schreibwege über `httpsCallable` sind hier nicht aufgeführt.

| # | Datei:Zeile | Aufruf | Dokumentpfad | Felder | Anlass in der App |
|---|---|---|---|---|---|
| W1 | `src/context/AuthContext.tsx:78` | `setDoc` (ohne merge) | `users/{uid}` | `firstName`, `lastName`, `email`, `notificationPreferences` (Defaults), `createdAt` (serverTimestamp) | Registrierung (`signUp`), direkt nach dem Anlegen des Auth-Users |
| W2 | `src/services/pushRegistration.ts:90` | `setDoc` merge | `users/{uid}` | `fcmToken` | Push aktivieren (FCM-Zweig; iOS-PWA nutzt stattdessen die Callable `saveWebPushSubscription`) |
| W3 | `src/components/notifications/NotificationPreferences.tsx:78` | `setDoc` merge | `users/{uid}` | `notificationPreferences` (gesamtes Objekt) | Benachrichtigungs-Einstellungen speichern (`/notifications`) |
| W4 | `src/components/onboarding/OnboardingFlow.tsx:55` | `updateDoc` | `users/{uid}` | `onboardingCompleted`, `onboardingCompletedAt` | Onboarding abschließen (Fehler werden verschluckt, localStorage genügt) |
| W5 | `src/components/header/NotificationDropdown.tsx:79` | `updateDoc` je Dokument | `users/{uid}/notifications/{id}` | `readAt` | „Alle gelesen“ im Header-Dropdown |
| W6 | `src/components/header/NotificationDropdown.tsx:90` | `updateDoc` | `users/{uid}/notifications/{id}` | `readAt` | Einzelne Benachrichtigung als gelesen markieren |
| W7 | `src/pages/NotificationsPage.tsx:116` | `updateDoc` je Dokument | `users/{uid}/notifications/{id}` | `readAt` | „Alle gelesen“ auf `/notifications` (mit Typfilter) |
| W8 | `src/pages/NotificationsPage.tsx:127` | `updateDoc` | `users/{uid}/notifications/{id}` | `readAt` | Einzelne als gelesen markieren |
| W9 | `src/pages/NotificationsPage.tsx:138` | `deleteDoc` | `users/{uid}/notifications/{id}` | – | Einzelne Benachrichtigung löschen |
| W10 | `src/pages/NotificationsPage.tsx:158-160` | `writeBatch` + `batch.delete` (450er-Blöcke) | `users/{uid}/notifications/*` | – | „Alle löschen“ |
| W11 | `src/pages/Admin/MockTools.tsx:143` | `updateDoc` | `nfl_schedules/{season}_week_{week}` | `games` (ganzes Array, ein Spiel mit neuer `gameTime_epoch`) | Admin-Mock: Spielzeit ändern |
| W12 | `src/pages/Admin/MockTools.tsx:215` | `setDoc` (überschreibt) | `players/{id}/gamestats/{gameId}` oder `teams/{id}/gamestats/{gameId}` | `gameId`, `season`, `week`, `lastUpdated`, dazu frei eingegebenes JSON (`fantasyPoints` bzw. `fantasyPoints{Passing,Rushing,Defense,SpecialTeams}` und weitere) | Admin-Mock: Spielstatistik setzen |

## 2. Lesezugriffe nach Sammlung

Zugriffe auf `weeklyLineups` mit fremder `userId` (Lineups anderer Liga-Mitglieder) kann ich aus dem Aufrufer nicht sicher belegen; die Funktionen nehmen `userId` als Parameter (`lineupFetchingService.ts`, `analyticsService.ts`).

| Sammlung / Pfad | Art | Datei:Zeile | Wofür |
|---|---|---|---|
| `users/{uid}` | Dokument | `UserDropdown.tsx:27`, `NotificationPreferences.tsx:68`, `utils/userProfiles.ts:28,79` | Eigenes Profil, Einstellungen; Namen anderer Nutzer für Ranglisten (`userProfiles.ts`, beliebige `uid`) |
| `users/{uid}/notifications` | Abfrage (`readAt`, `type`, `createdAt`, `limit 20`, `startAfter`); Abfrage ohne Filter für „Alle löschen“ | `NotificationDropdown.tsx:36,45,75`, `NotificationsPage.tsx:35,73,110,149` | Benachrichtigungsliste, Gelesen-Markierung, Löschen |
| `users/{uid}/weeklyLineups/{leagueId}_{season}_{week}` | Dokument und `onSnapshot` | `lineupFetchingService.ts:425,461,914,951` | Lineup-Editor, Anzeige, Punkte |
| `users/{uid}/weeklyLineups` | Abfrage (`leagueId`, `season`, `week`, `orderBy week`, `limit`) | `analyticsService.ts:127,523,537`, `hooks/useUsageTracking.ts:43` | Analytics, Wochenvergleich, Usage-Zähler aus Lineups |
| `users/{uid}/leagueUsage/{leagueId}_{season}/usageCounts` | ganze Subsammlung | `lineupFetchingService.ts:665` | Usage-Limit je Entity (5) im Lineup-Editor |
| `leagues` | Abfrage `isPublic == true`, `createdAt desc`, Seitengröße | `utils/leagues.ts:171` | Öffentliche Ligen |
| `leagues` | Abfrage `memberUids array-contains uid`, `createdAt desc` (einmalig und `onSnapshot`) | `utils/leagues.ts:194,242` | Meine Ligen |
| `leagues/{id}` | Dokument, `getDoc` und `onSnapshot` | `utils/leagues.ts:206,333`, `ProphetLeaderboard.tsx:275` | Liga-Details, Standings, Einstellungen |
| `weeklyTips/{leagueId}_week_{week}_season_{season}` | Dokument, `onSnapshot` und `getDoc` | `WeeklyTips.tsx:133`, `ProphetLeaderboard.tsx:270,351` | Spiele und Quoten der Tipps |
| `weeklyTips/{id}/userTips/{uid}` | Dokument, `onSnapshot` | `WeeklyTips.tsx:159` | Eigene abgegebene Tipps |
| `weeklyTips/{id}/userTips` | ganze Subsammlung | `ProphetLeaderboard.tsx:281,371` | Fallback-Leaderboard aus allen Tipps der Liga |
| `players` | Abfrage `position == X` | `lineupFetchingService.ts:234` | Spielerauswahl im Lineup |
| `players/{id}` | Dokument | `lineupFetchingService.ts:488` | Spielerdetails |
| `teams` | Abfrage (alle) und `abbreviation == X`, `limit 1` | `lineupFetchingService.ts:300`, `WeeklyTips.tsx:310` | Team-Auswahl; Team zu Kürzel |
| `teams/{id}` | Dokument | `lineupFetchingService.ts:548`, `WeeklyTips.tsx:298` | Teamdetails |
| `players/{id}/gamestats`, `teams/{id}/gamestats` | Abfrage `gameId == X`; Dokument; `onSnapshot` | `lineupFetchingService.ts:624,740,748,785,805`, `hooks/useEntityGameStats.ts:43`, `MockTools.tsx:165` | Wochenpunkte und Stats-Modal |
| `nfl_schedules/{season}_week_{week}` | Dokument | `lineupFetchingService.ts:701`, `MockTools.tsx:127` | Spielplan, Lock-Zeiten |
| `gameScores/{gameId}` | Dokument | `lineupFetchingService.ts:849` | Spielstand |
| `gameScores` | Abfrage `week == X`, `season == Y` | `hooks/useActualLineupPoints.ts:37` | Spielstatus für Live-Punkte |

Nicht gefunden im Client: Lesezugriffe auf `nfl_players`, `apiCache`, `prophetStandings` (die Rules erlauben sie).

## 3. Zuordnung zu den Regeln in `firestore.rules`

Mehrere Regeln können auf denselben Pfad passen; Firestore erlaubt dann, sobald eine davon erlaubt (ODER).

| Zugriff | Regel (Zeilen in `firestore.rules`) | Bedingung |
|---|---|---|
| W1–W4 (`users/{uid}`) | `match /users/{uid}`, `allow write` (Z. 28) | angemeldet und `auth.uid == uid`. Kein Feldschutz |
| W5–W10 (`users/{uid}/notifications/{id}`) | `match /users/{uid}/{collectionId}/{docId}`, `allow read, write` (Z. 32–34) | angemeldet und eigene `uid`. Der Client benutzt Update und Delete, nicht Create |
| W11 (`nfl_schedules`) | `allow create, update, delete` (Z. 122) | `auth.token.admin == true` |
| W12 (`players\|teams/*/gamestats`) | Z. 100–103 und 113–116 | `auth.token.admin == true` |
| Lesen `users/{uid}` | Z. 27 | jeder angemeldete Nutzer, auch fremde Profile (inkl. `email`, `fcmToken`) |
| Lesen `users/{uid}/notifications` | Z. 32–34 | nur eigene `uid` |
| Lesen `weeklyLineups` | Z. 37–42 und Z. 32–34 | eigene `uid`, oder Mitglied der Liga aus der ID (`split('_')[0]`). Z. 32–34 erlaubt dem Besitzer ohnehin alles |
| Lesen `leagueUsage/…/usageCounts` | Z. 47–49 | eigene `uid` |
| Lesen `leagues`, `leagues/{id}` | Z. 53–55 | jeder angemeldete Nutzer (`get`, `list`) |
| Lesen `weeklyTips/{id}` und `userTips` (alle Dokumente der Liga) | Z. 63–65 und 70–72 | Mitglied der Liga aus der ID |
| Lesen `players`, `teams`, `gameScores`, `nfl_schedules` | Z. 93–95, 106–108, 119–120, 126–127 | jeder angemeldete Nutzer |
| Lesen `…/gamestats` | Z. 101, 114 | jeder angemeldete Nutzer |

Hinweis zur Abfrage `weeklyTips/{id}/userTips` (ganze Subsammlung): Die Regel prüft nur Mitgliedschaft, nicht `userId`. Das funktioniert nur, weil sie dafür ausgelegt ist.

## 4. Git-Historie: Hat ein früherer Client direkt geschrieben?

Methode: `git log -S` und `git log -G` auf `src/`, dazu die Diffs der Treffer gelesen. Lücken: `-S` zählt nur Änderungen der Trefferzahl; ich habe nicht jede Fassung jeder Datei vollständig gelesen. Die Aussage „nie“ ist deshalb eine Befundlage aus Pickaxe-Treffern, kein Beweis.

| Sammlung | Direkter Client-Schreibzugriff gefunden? | Beleg | Vermutlich ersetzt durch |
|---|---|---|---|
| `weeklyLineups` | **Nein**, in keiner Fassung | `-S"weeklyLineups"` in `src/` trifft erst `03f2266` (28. Jun 2025, „New UI with state management…“) und `cf74b6b` (28. Jul 2025). Vor `03f2266` kommt der Name im Client nicht vor. In `03f2266` taucht `saveWeeklyLineupCallable` auf (`src/firebase/callables.ts`, `lineupStore.ts`, `useLineupState.ts`). Alle Commits mit `setDoc/updateDoc/writeBatch/deleteDoc` in `src/` (siehe unten) betreffen keine Lineup-Dateien | Callable `saveWeeklyLineup` seit mindestens `03f2266` |
| `leagueUsage` / `usageCounts` | **Nein**, in keiner Fassung | Treffer nur in `03f2266`, `4836525` (25. Jul 2025), `cf74b6b`, `19c5571` (26. Aug 2025); keiner davon in der Liste der Commits mit Schreibaufrufen. Gelesen wird die Subsammlung (heute `lineupFetchingService.ts:665`) | Zähler schreibt die Transaktion in `saveWeeklyLineup` (Funktions-Code, hier nicht geprüft) |
| `weeklyTips` / `userTips` | **Nein**, in keiner Fassung | Treffer auf `userTips` in `03f2266`, `d964f07` (24. Jul 2025), `d2d3dae` (19. Aug 2025). Im Diff stehen `getDoc`/`getDocs`/`onSnapshot` und die Callable `submitTips`; die übrigen Treffer sind der Zustandsname `userTips` im Store | Callable `submitTips` (schon in `03f2266` im Diff) |

Commits, in denen `src/` überhaupt `setDoc/updateDoc/writeBatch/deleteDoc` einführte oder änderte:

| Commit | Datum | Dateien |
|---|---|---|
| `f1c29c4` | 2. Mai 2025 | `AuthContext.tsx` |
| `ddb4f5a` | 3. Mai 2025 | `firebase/firebase.ts` |
| `d5d3499` | 4. Mai 2025 | `AuthContext.tsx` |
| `03f2266` | 28. Jun 2025 | `firebase/firebase.ts`, `AdminPage.tsx` |
| `cf74b6b` | 28. Jul 2025 | `OnboardingFlow.tsx` |
| `d2d3dae` | 19. Aug 2025 | `NotificationDropdown.tsx`, `NotificationPreferences.tsx`, `MockTools.tsx`, `AdminPage.tsx`, `NotificationsPage.tsx` |
| `2136308` | 12. Jun 2026 | `NotificationPreferences.tsx`, `firebase/firebase.ts`, `NotificationsPage.tsx` (Batch-Löschen), `pushRegistration.ts` |

Unsicher bleibt: Was in `firebase/firebase.ts` und `AdminPage.tsx` (alte Fassungen, heute zerlegt in `pages/Admin/`) geschrieben wurde, habe ich nicht im Einzelnen gelesen. Aus der Dateiwahl ergibt sich kein Bezug zu Lineups, Usage oder Tipps, aber ausgeschlossen ist es nicht. Die Fassungen vor `03f2266` (Mai 2025, vor der Lineup-UI) enthalten laut Pickaxe keinen der drei Sammlungsnamen. Ein Datum „bis zu dem direkt geschrieben wurde“ gibt es deshalb nach diesem Befund nicht.

Nicht geprüft: Ob außerhalb von `src/` (z. B. Skripte) geschrieben wurde, und ob Fassungen auf anderen Branches (`new`, `origin/*`) abweichen. Die Historie dieses Worktrees reicht bis `ce4aa61` (22. Apr 2025).

## 5. Schreibrechte der Regeln, die der aktuelle Client nicht nutzt

| Pfad | Regel (Z.) | Erlaubt | Client nutzt | Anmerkung |
|---|---|---|---|---|
| `users/{uid}/weeklyLineups/{id}` | 43 (und 32–34) | Lesen und Schreiben, alle Felder, durch den Besitzer | nein (nur Lesen) | Besitzer könnte Lineup, `isComplete`, `totalActualPoints`, `usage` selbst setzen und Lock und Usage-Limit umgehen. Die Callable prüft das, die Regel nicht |
| `users/{uid}/leagueUsage/{id}/usageCounts/{item}` | 47–49 | Lesen und Schreiben durch den Besitzer | nein (nur Lesen) | Besitzer könnte Zähler zurücksetzen und damit das Limit 5 umgehen |
| `weeklyTips/{id}/userTips/{userId}` | 73–75 | Schreiben (create, update, delete) durch das Mitglied für sich selbst | nein (nur Lesen) | Keine Prüfung von Spielsperre oder Inhalt. Tipps nach Anpfiff wären per Client möglich, falls der Client nicht die Callable benutzt |
| `users/{uid}` | 28 | auch `delete` und beliebige Felder | Create, Merge, Update (W1–W4) | Delete und Felder wie `email` oder künftige Admin-Felder sind nicht eingeschränkt. Admin-Rolle hängt am Custom Claim, nicht am Dokument |
| `users/{uid}/{collectionId}/{docId}` | 32–34 | beliebige Subsammlung, Tiefe 1, lesen und schreiben | nur `notifications` (Update, Delete) | `create` in `notifications` und alle anderen Sammlungsnamen ungenutzt. Der Nutzer kann sich damit selbst Benachrichtigungen anlegen |
| `players/*/gamestats/*`, `teams/*/gamestats/*` | 102, 115 | Admin: create, update, delete | nur `setDoc` (W12) | `delete` ungenutzt |
| `nfl_schedules/*` | 122 | Admin: create, update, delete | nur `updateDoc` (W11) | `create`, `delete` ungenutzt |

Alles übrige ist `allow … if false` (`leagues`, `weeklyTips` selbst, `prophetStandings`, `nfl_players`, `players`, `teams`, `gameScores`, `apiCache`) und wird vom Client auch nicht beschrieben.

Nicht festgestellt: Ob die Rules in Produktion mit der Datei übereinstimmen. Die Datei im Repo ist das, was ich gelesen habe; ein Abgleich mit dem deployten Stand wäre nur über die Firebase-Konsole oder CLI möglich und war hier nicht erlaubt.

## Vorschlag für eine eigene Aufgabe

Rules für `weeklyLineups`, `usageCounts` und `userTips` auf `allow write: if false` stellen. Zuvor prüfen, ob `saveWeeklyLineup` und `submitTips` die Dokumente wirklich vollständig schreiben (Admin SDK umgeht die Regeln), und ob ein Offline-Pfad im Client (Offline-Queue in `lineupStore`) Firestore direkt anspricht. Aus dem hier gelesenen Code ergibt sich: nein, aber das gehört in eine eigene Prüfung mit Emulator-Test.
