# Season rollover

Checked 2026-10-14 in production Firestore. Do not change the code until the 2027 rollover. The 2026 repair has already run (confirmed 2026-11-08): root totals are the 2026 points and PPG is usable. Do not run it again unless stats are reprocessed. Weeks 1–5 are stored as `season: 2026` and stay in the total.

## What breaks

`players.seasonFantasyPoints` and `teams.seasonFP_Passing`, `seasonFP_Rushing`, `seasonFP_Defense`, `seasonFP_ST` never reset. `statsSync` only increments them. `dataSync` overwrites `gamesPlayed` from the current season, but leaves the point totals alone.

Lineup PPG is `season points / gamesPlayed`. After five 2026 games, Josh Allen showed 114.12 PPG because 570.58 points (2025 + 2026) were divided by 5. The 2026-only total was 155.96, so the real PPG is 31.19. Arizona, Denver, and Detroit had the same split: 17 games from 2025 plus weeks 1–5 from 2026.

`repairSeasonFantasyPoints` rewrites those root totals from `gamestats` where `season == 2026`. It does not delete game docs. That rewrite has been applied for 2026. Run it again only after a stats reprocess, because reprocessing updates the `season` field without adding unchanged points back onto the root total. The Josh Allen figures below are the pre-repair snapshot from 2026-10-14.

Quick Actions and the auto assistant still fall back to `seasonFP / 17` and `rawSeasonStats` when PPG is 0. The roster fetch does not pass a season year.

## Fix before 2027 week 1

- Stamp `fantasyPointsSeason` on player and team docs. When it is not the current season, zero the point totals before new games are added.
- Keep PPG at 0 until the current season has games. Drop the `seasonFP / 17` and previous-season `rawSeasonStats` fallbacks.
- Pass the season into the Tank01 roster request.
