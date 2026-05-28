## 0.2.1 (WIP)

* Load the user document on auto-recreated and DB-restored MCP sessions, not just `user_id` - permission checks read `conduit.session('UserData')`, so a session rebuilt from a valid API key (e.g. a client reconnecting after a server restart) was being denied every permission despite being authorized
* Migrate the test suite to the alchemymvc TestHarness

## 0.2.0 (2026-01-23)

* Add MCP Server framework

## 0.1.0 (2024-03-28)

* Initial release