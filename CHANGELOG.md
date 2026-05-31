## 0.2.2 (2026-05-31)

* Add a generic file-upload feature: an MCP server opts in by adding `UploadTools` to its `tool_classes`. `request_upload_path` returns a readable, session-scoped reference plus a tokenised upload URL; the file is uploaded with a plain `curl -F "file=@..."` and stays an ephemeral temp file until a tool consumes the reference (single-use, 15-minute TTL)
* Add the `allow_local_file_access` setting (default false) and `McpTool#assertDownloadAllowed()` so tools that download URLs reject `file://`, non-http(s) schemes and private/loopback hosts unless explicitly enabled

## 0.2.1 (2026-05-31)

* Load the user document on auto-recreated and DB-restored MCP sessions, not just `user_id` - permission checks read `conduit.session('UserData')`, so a session rebuilt from a valid API key (e.g. a client reconnecting after the hourly cleanup or a server restart) was being denied every permission despite being authorized
* Persist auto-created sessions to the database, so a reconnect after a cleanup restores the session (and its tool history) instead of starting over
* Migrate the test suite to the alchemymvc TestHarness

## 0.2.0 (2026-01-23)

* Add MCP Server framework

## 0.1.0 (2024-03-28)

* Initial release