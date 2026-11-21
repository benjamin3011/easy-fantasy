# Profile `users/{uid}`: Lesezugriff für alle angemeldeten Nutzer

Stand: Branch `bot/t_a4d5de9cfc8abc56`, nach Commit `61e1791`. Reine Durchsicht von `src/`, `functions/src/` und `firestore.rules`. Nichts wurde ausgeführt, geändert oder gegen echte Daten geprüft.

**Kurzbefund:** `firestore.rules` Z. 26–29 erlaubt `read` (also `get` **und** `list`) für jeden angemeldeten Nutzer. Damit sind `email`, `fcmToken`, `webPushSubscription` (inkl. Schlüssel `auth`/`p256dh`) und `notificationPreferences` fremder Nutzer lesbar. Wegen `list` kann man vermutlich auch die ganze Sammlung `users` abfragen und so alle E-Mail-Adressen einsammeln. Das habe ich nicht im Emulator getestet; `test/rules/reads-must-stay-allowed.test.mjs` prüft nur `getDoc`. Der Client braucht von fremden Profilen **nur `firstName`**.

## 1. Felder in `users/{uid}`

| Feld | Geschrieben von | Gelesen von | Privat? |
|---|---|---|---|
| `firstName` | Client `AuthContext.tsx:78` (nur bei Registrierung) | Client (Ranglisten, eigenes Menü), Typ `FirestoreUser` | Nein (Anzeigename) |
| `lastName` | wie `firstName` | nur eigenes Menü `UserDropdown.tsx:63`; fremd geladen, aber nirgends angezeigt | Halb: Klarname, im Client ungenutzt |
| `email` | Client bei Registrierung | Functions `email.ts:56,89` (Liga-Mails); Client eigenes Menü `UserDropdown.tsx:107` | **Ja** |
| `createdAt` | Client bei Registrierung (`serverTimestamp`) | nicht gefunden | Gering |
| `lastLoginAt` | nur im Typ `FirestoreUser` (`functions/src/types.ts:361`); Schreiber nicht gefunden | nicht gefunden | Gering; ob das Feld in Produktion existiert, ist unbekannt |
| `fcmToken` | Client `pushRegistration.ts:90`; Functions löschen/bereinigen (`notifications.ts:139`, `admin.ts:504`) | Functions (`notifications.ts`, `statsSync.ts:690`, `dataSync.ts:368`, `admin.ts:396`) | **Ja** (Push-Adresse des Geräts) |
| `webPushSubscription` (`endpoint`, `keys.auth`, `keys.p256dh`) | Callable `saveWebPushSubscription` (`notifications.ts:715`), Löschen `:743` | Functions | **Ja**, mit den Schlüsseln kann man an das Gerät senden |
| `notificationPreferences` (Schalter, Minuten, `quietHours`) | Client `AuthContext.tsx:78`, `NotificationPreferences.tsx:78`; Functions `notifications.ts:957` | Client eigenes Profil; Functions | **Ja** (Einstellungen, Ruhezeiten) |
| `onboardingCompleted`, `onboardingCompletedAt` | Client `OnboardingFlow.tsx:55` | nicht gefunden (localStorage zählt laut Code) | Gering. Nicht im Typ `FirestoreUser` |

Nicht ausgeschlossen: weitere Felder in Produktionsdaten, die kein Code der Repo-Fassung schreibt (ältere Fassungen, manuelle Eingriffe). Das ließ sich ohne Zugriff auf echte Daten nicht prüfen.

Unterhalb von `users/{uid}` liegen `notifications`, `weeklyLineups`, `leagueUsage/…/usageCounts`. Sie haben eigene Regeln (Z. 32–50): `notifications` nur Besitzer, `weeklyLineups` zusätzlich Liga-Mitglieder. Sie sind nicht Thema dieser Analyse.

## 2. Stellen im Client, die ein fremdes Profil lesen

| Stelle | Liest | Benutzt davon wirklich |
|---|---|---|
| `src/utils/userProfiles.ts:27` (`fetchUserProfiles`), aufgerufen von `ModernLeaderboard.tsx:105` (Liga-Rangliste, `uids` = Mitglieder) | `users/{uid}` je Mitglied, übernimmt `firstName`, `lastName`, `email` | nur `firstName` (`ModernLeaderboard.tsx:222,301`) |
| dieselbe Funktion, aufgerufen von `ProphetLeaderboard.tsx:223` (Prophet-Rangliste) | wie oben | nur `firstName` (`:529,585`) |
| `src/utils/userProfiles.ts:78` (`fetchUserProfile`, einzeln) | `users/{uid}` | **keine Aufrufer gefunden** |

Alle anderen Lesezugriffe auf `users/{uid}` betreffen das **eigene** Profil: `UserDropdown.tsx:27`, `NotificationPreferences.tsx:68`. Die Funktionen laden auch fremde Profile nur, weil `uid` ein Parameter ist; weitere Aufrufer außer den zwei oben habe ich per Suche nach `userProfiles` / `fetchUserProfile` nicht gefunden. Mit `onSnapshot` oder `list` auf `users` greift der Client nirgends zu.

Wichtig fürs Ausrollen: Schlägt der Read fehl, fängt `fetchUserProfiles` den Fehler ab (Z. 47–54) und zeigt „Unknown“. Ein Schließen der Regel **bricht ältere Clients also nicht ab**, sie zeigen nur keine Namen mehr.

## 3. Lösungswege

Firestore-Regeln gelten pro Dokument. Sie können beim Lesen keine einzelnen Felder ausblenden (auch kein `select`). Solange `email` und `fcmToken` im selben Dokument wie `firstName` liegen, gibt es nur „alles“ oder „nichts“. Die Trennung muss daher in den Daten passieren.

| | A: öffentliches Teilprofil `publicProfiles/{uid}`, gepflegt von einer Function | B: Aufteilung in öffentliches `users/{uid}` und privates Dokument | C: Namen aus `leagues.members[].teamName`, `users` einfach schließen |
|---|---|---|---|
| Idee | Neue Sammlung nur mit `firstName` (optional `lastName`). Trigger `onDocumentWritten('users/{uid}')` kopiert. Regeln: `publicProfiles` lesen für Angemeldete, schreiben `false`; danach `users/{uid}` nur noch für den Besitzer | Private Felder (`email`, `fcmToken`, `webPushSubscription`, `notificationPreferences`) wandern in ein Besitzer-Dokument, z. B. `users/{uid}/private/main`. Die bestehende Regel Z. 32–34 deckt das schon ab. `users/{uid}` bleibt öffentlich | Ranglisten zeigen `teamName` (steht schon im Liga-Dokument, `leagues.ts:339`). Kein neues Dokument |
| Änderungen Functions | 1 Trigger + einmaliger Backfill. Lesende Functions unverändert | Alle Stellen aus Abschnitt 1 (`notifications.ts`, `statsSync.ts`, `dataSync.ts`, `email.ts`, `admin.ts`) auf neuen Pfad, Daten-Migration | keine |
| Änderungen Client | `userProfiles.ts` liest `publicProfiles` | `AuthContext`, `pushRegistration`, `NotificationPreferences` schreiben/lesen neuen Pfad | Ranglisten ohne `userProfiles` (Namen ändern sich sichtbar von Vorname auf Teamname) |
| Aufwand | klein bis mittel | **hoch** | klein |
| Risiko laufende App | gering: rein additiv, alter Pfad bleibt bis zuletzt | **hoch**: Ältere Clients schreiben `fcmToken` und `notificationPreferences` weiter in `users/{uid}` und lesen Einstellungen von dort. Das Leck bliebe bestehen, und Push/Einstellungen würden auseinanderlaufen. Functions müssten beide Orte lesen | gering technisch, aber Funktionsänderung für Nutzer; die Lücke bei `users` schließt es nur, wenn danach trotzdem Regeln zu gehen |
| Wirkung | schließt Lücke vollständig (nach Regelschritt) | schließt Lücke erst, wenn alle alten Clients weg sind | wie A, ohne Teilprofil |
| Offen | Kurze Verzögerung für neue Nutzer: Trigger läuft nach dem Client-Write, bis dahin „Unknown“ | Migration jedes Dokuments, Race mit alten Clients | `teamName` ist kein Ersatz für den Vornamen, wenn der Auftraggeber Vornamen will |

**Empfehlung: A.** Rein additiv, die vorhandenen Schreibwege bleiben unverändert, und die Lücke wird mit einer einzigen Regeländerung am Ende geschlossen. B würde dagegen die Pfade aller lesenden Functions und der Schreib-Clients ändern. C ist eine Produktentscheidung, kein Sicherheitsfix.

Ob Regeln `get` für fremde Nutzer und `list` getrennt behandeln sollen, ist dabei egal: Für `users/{uid}` genügt am Ende `allow get: if auth.uid == uid; allow list: if false;`.

## 4. Reihenfolge für Weg A

Grundsatz: Jeder Schritt ist für sich rückwärtskompatibel, und die Regel für `users` wird zuletzt eingeschränkt. Ältere, auf Geräten installierte PWA-Fassungen (Update-Prompt statt Auto-Reload, `AGENTS.md`) lesen bis dahin weiter `users/{uid}`.

| # | Schritt | Was | Bricht etwas? | Zurück |
|---|---|---|---|---|
| 1 | Functions | Trigger `syncPublicProfile` (setzt `publicProfiles/{uid}` mit `firstName`, `lastName`, löscht bei gelöschtem Nutzer); Admin-Backfill für alle bestehenden Nutzer (Admin-SDK, umgeht Regeln). Deployen und Backfill laufen lassen | Nein, nichts liest die Sammlung | Function löschen |
| 2 | Regeln, additiv | `match /publicProfiles/{uid} { allow read: if request.auth != null; allow write: if false; }`. `users` bleibt unverändert. Vorher klären, ob die Repo-Regeln mit den deployten übereinstimmen: Der Stand der `usageCounts`-Sperre ist nicht als deployt belegt, ein Regel-Deploy würde sie mit ausrollen | Nein | Block entfernen |
| 3 | Prüfen | Anzahl Dokumente `users` = `publicProfiles`; Stichprobe `firstName`. Muss im Betrieb mit echten Daten jemand mit Berechtigung tun, ich konnte das nicht | – | – |
| 4 | Client | `userProfiles.ts` liest `publicProfiles/{uid}`; `email` und `lastName` aus `UserProfile` entfernen (ungenutzt); „Unknown“-Fallback bleibt. Eigenes Profil weiter aus `users/{uid}`. Hosting-Deploy | Nein: neue Clients nutzen neuen Pfad, alte lesen `users` weiter (Regel noch offen) | Hosting-Rollback |
| 5 | Warten | Bis alte Fassungen weg sind. Eine Messung dafür gibt es nicht: `VITE_SENTRY_DSN` fehlt im Live-Build (`AGENTS.md`), eine Versionsnummer kommt nicht an. Praktisch: Mitglieder der privaten Liga bitten, die App neu zu laden, plus mindestens einen NFL-Spieltag abwarten | – | – |
| 6 | Regeln, schließen | `users/{uid}`: `allow get: if auth.uid == uid; allow list: if false; allow write` unverändert. Die Regel-Tests in `test/rules/` anpassen: fremder Lesezugriff auf `users/{uid}` (reads-must-stay-allowed) wird zu `assertFails`, `publicProfiles` kommt dazu | Ältere Clients zeigen in Ranglisten „Unknown“ statt Namen (Fehler wird abgefangen), sonst nichts. Eigenes Profil, Push, Einstellungen laufen weiter | Regel wieder öffnen |

Punkte, die ich nicht sicher feststellen konnte:

- Ob außer `ModernLeaderboard` und `ProphetLeaderboard` weitere Clients (Skripte, andere Apps) `users` fremder Nutzer lesen. Im Repo nicht gefunden.
- Ob die deployten Regeln dem Repo entsprechen (siehe Schritt 2).
- Ob ein Nutzer seinen Namen ändern kann: Ich habe keinen Schreibzugriff auf `firstName`/`lastName` außer bei der Registrierung gefunden. Der Trigger deckt Änderungen trotzdem ab.
- `list` auf `users` ist nur aus der Regel gelesen, nicht im Emulator getestet.

## Vorschläge für eigene Aufgaben

- Regel-Test, der `getDocs(collection(db, 'users'))` als fremder Nutzer prüft (belegt das Enumerieren).
- Felder in `users/{uid}` beim Schreiben einschränken (z. B. `fcmToken` nur String, keine Fremdfelder). Das ist unabhängig von diesem Thema.
