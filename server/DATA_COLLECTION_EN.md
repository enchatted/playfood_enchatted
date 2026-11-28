# PLAYFOOD — data collection

## Purpose and identifiers

When statistics are enabled, PLAYFOOD records game activity for project KPIs such as visits, recorded browser profiles, mission attempts, completion and time spent. The random learner_id is saved in browser local storage as playfood-learner. It identifies a browser profile, not a verified child. Shared browsers can share an ID; clearing storage or changing browser/site can create another. Without working storage it lasts only for the page load. This is a persistent pseudonymous identifier, not a guarantee of complete anonymity. A new random session_id identifies a page visit; a random attempt_id identifies a game attempt.

## Fields stored

Each event has ts (server arrival time in epoch milliseconds), learner_id, session_id, type, island, game, score, stars, duration_s, progress, language and returning. Game-attempt events may also have attempt_id and passed (pass/fail on a finished round). Fields that do not apply are empty. Event types are session_start, hero_chosen, island_enter, game_start, game_finish, game_abandon, session_end and phygital_redeem. For hero_chosen, the game column contains the selected predefined hero ID; it is not a game name. For phygital_redeem (a Play Code for an offline activity was accepted), the game column contains the activity ID from the school's activity list; the typed code itself is not stored. progress is recorded objective progress on exit, not a learning score. language is the game language, not country; returning means an existing browser statistics ID was found.

## Time measurements

New ended or abandoned rounds may include timing_version=1 and six non-overlapping totals in seconds: active_s (available play with recent input), learning_s (guidance/help/decision cards displayed), paused_s (pause or exit menus), hidden_s (hidden or unfocused page), idle_s (time after five minutes without input during play or guidance), other_s (loading, transitions and results). Guidance time is not proof of reading; active time is not proof of learning. The duration_s field is elapsed round or visit time and includes pauses and hidden time. Missing final events leave duration unknown; older records may lack time splits. No individual keys, pointer movements or answers are saved in the statistics database.

## What is not in the event database

The event allowlist excludes names, email addresses, IP addresses, user-agent strings and free text. The server necessarily receives network addresses and uses them temporarily in memory to limit requests; this is different from storing them in event rows. Panel staff emails and password hashes are kept separately in users.txt, with temporary login sessions in server memory. The browser also keeps game progress separately from statistics. Play Codes restore progress and do not link statistics IDs across browsers.

## Storage and access

The local review package stores events in server/playfood.db (SQLite) on the computer running the server. Signed-in panel staff can view summaries, export event rows as CSV and obtain a database backup through the authenticated API. CSV keeps ts and adds timestamp_utc in ISO 8601 UTC. For a hosted installation, storage is on that installation’s server; the operator must confirm the provider, country, access and any proxy/server logs before use. This note does not assert that a published service has verified EU hosting.

## Defaults, retention and switching off

The default is PANEL_ENABLED=no. A configured review package may explicitly enable it. RETENTION_MONTHS defaults to 24; rows older than the configured cutoff are purged at server startup and every 24 hours while it runs. Already exported CSV, PDF and backups are separate files and are not automatically purged. Set PANEL_ENABLED=no in server/playfood.config.txt and save: the server reloads it within 30 seconds, then discards new events and disables panel data access. Reload the game page so the browser also stops sending. Switching off does not erase old database rows or clear browser IDs/progress. The installation operator manages existing copies and retention requests.

