<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
Project Constitution
We are building an open-source alternative to Airtable and Google Sheets, with a touch of Notion behavior.

The app should work well offline or on unreliable connection, as well as gracefully handle server errors. App should be Crash-First; so writing recovery code should have priority over. All user operations should be first locally stored in IndexedDB.

Try using existing popular open-source powerful libraries for common functionality, instead of coming up with our own implementation (example: notification toast). If something requires custom implementation

We are using Supabase, so use its tooling and workflow and best practices and philosophy.

When grepping files, skip node_modules .

Put store/sync/storage logic in store/service layer, not in UI.
