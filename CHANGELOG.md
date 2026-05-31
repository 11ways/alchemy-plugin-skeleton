## 0.2.1 (2026-05-31)

* Load the user document on auto-recreated and DB-restored MCP sessions, not just `user_id` - permission checks read `conduit.session('UserData')`, so a session rebuilt from a valid API key (e.g. a client reconnecting after the hourly cleanup or a server restart) was being denied every permission despite being authorized
* Persist auto-created sessions to the database, so a reconnect after a cleanup restores the session (and its tool history) instead of starting over
* Migrate the test suite to the alchemymvc TestHarness

## 0.2.0 (2026-01-23)

* Add MCP Server framework

## 0.1.0 (2024-03-28)

* Initial release