<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
# Project Constitution.
The whole app should conform to this philosophy.
We are making the world a better place (and fulfilling my Dream) by building an open-source alternative to Airtable and Google Sheets, with a touch of Notion and LowCode/NoCode behavior.

Structable is the general-purpose table with metadata&comments&notes on each cell (generalized even to column-header cells (effectively comment on entire column) and row-header cells (effectively comment/note on entire row)).

ComRev is a first use-case of Structable. It helps with comparing projects, products and repos.
Later we will add more use-cases.
So nothing that is general-purpose should be called "repo". Use row/item term instead.

The app should work well offline or on unreliable connection, as well as gracefully handle server errors. App should be Crash-First; so writing recovery code should have priority over. All user operations should be first locally stored in IndexedDB.
App should always display in top-right corner a status of sync. Any operation that user takes should go via central code that updates the cloud sync indicator.
We try hard to not lose user data (example: ) and to not lure the User into a false sense of security that data has been saved (hence the sync indicator).
But we don't want the indicator to get distracting/annoying, so it should animate transitions smoothly, so as to not distract the user's peripheral vision which is very sensitive to movement/changes.
No id-s should be sequence number (but sequence number is allowed as a local helper metadata). It's supposed to be fully distributed and fault-tolerant (what if it crashes and gets the sequence number wrong). Use nanoid.
Exception to the nanoid rule is when power user directly assigns a human-readable column id (by default hidden under "advanced" options).

Try using existing popular open-source powerful libraries for common functionality, instead of coming up with our own implementation (example: notification toast). If something requires custom implementation, it will be stated as such explicitly. We should have multiple pages for testing our own table vs existing library.

We are using Supabase on the backend, but schema creation/evolution should live in the Rust store/service layer (`ensure_schema` and related helpers), including indexes for new columns. Do not add SQL migration files for normal schema changes.

When grepping files, skip node_modules normally (unless needed).

Put store/sync/storage logic in store/service layer, not in UI.

We go the extra mile to make sure user data is synced - so we retry the calls to the servers ad infinitum (unless it's bad practice).

User should be able to do all operations offline. Hence no "SERIAL" id-s.

The backend and frontend data model & mental model should be as close as possible. Backend should also store a log of all operations. We should gradually evolve it to be fully peer-to-peer syncable.
Actually a core of the backend Rust code should run on frontend.


One remark should be able to be attached to multiple cells/rows/columns.

As much as possible state should be sent to server, so that users can access.
Column hiding and widths should be configurable per-device, but sent to server. Initially when user opens website in new browser/device, the last-used settings should be fetched from server (whereas further modifications should be device-specific but also sent to server). Perhaps a composite primary key will be needed. 

Have an everything-is-an-Object mentality. And there are common operations on objects, principally commenting and adding notes. So unify code as much as possible to be able .
Other operations on objects:
* see properties, including common properties like who-created, when-created. Title, tagline, description.

### Private vs public
Most operations objects should have an option whether to make them public or private. For example adding a private note. 
#### Private vs public view
* users should be able to have private mode where the changes they make are only visible to them. So there should be a switch of public/private view. 

### Notes vs Comments
* comments indicate something actionable that needs to be dealt with (or replied to). There should be a "resolve" button on comments. Notes do not require "resolve" button.
* There should be as much as possible unification of the code for notes and comments - generalized name of the "base class": "remark". It should be possible to switch between note and comment, also after creation of the remark.

## Code structure
* de-duplicate code as much as possible
* keep methods, functions, classes, components small

## Graphic Design:
* primary color is orange. Secondary color is the opposite of orange on the color wheel.
* use subtle shades and tints for subtle differentiations.
* on top-left of the table
* ~5px rounded corners
* it should be themeable in realtime without reloading page (use CSS vars)

### Files handling
* when editing cell/remark text, it should be rich text
* when pasting an image, it should be embedded in

# Features
* column headers should have resizable height (defaulting to fit whole wrapped text heights of all column titles)
* objects (including remarks, columns, rows) should have who-created and when-created and who-modified-last, and when-modified as.

* we should have backend that can talk GraphQL, OpenAPI, gRPC, tRPC

Use Tonic ( grpc-rust ) for the syncing.

Everything is an object. And everything directly editable is also a cell; so unify the editor code.


Make the backend database pluggable, having 2 impl-s: Supabase and MongoDB and SurrealDB.

make the frontend data/sync/cache layer be in rust and grpc. Expose changes-listening via rxjs.
====
The sync/data layer should have its backing DB impl pluggable (e.g. Supabase, sqlite (on wasm too), SurrealDB, MongoDB)

Operations should be grouped by transaction id, or null if no transaction.

Client should be responsible for generating id (or manually provided by user, as advanced option)

## Error handling
* errors should not be ignored silently; at the least they should be logged, with some details.

Each cell should have its own url ( .../table_id/#rowId--column_id )

Later AI will edit table cells; so we need to facilitate this in the design.

# DB Architecture - indexes
* each user-visible table has a corresponding real physical SQL table ( / Mongo collection). This is to facilitate indexes. Each row has custom_vals JSONB field, which facilitates values in custom columns. Whenever a new custom column is added, an index on its field is added (field inside JSONB). Nested objects like stars_diff should get its own columns (and thus sort ascending+descending index) per sub-field, with column id with double underscore e.g. stars_diff__7d.
Columns (and thus indexes) should be added dynamically by the backend, upon encountering a new field or sub-field. While backend has the full user-defined schema in memory after launching, it can detect new fields / sub-fields and create column and index. So upload_to_structable should not worry about creating columns.

# Operation-log operation's sequence number
* keep in mind that this is local number, and not id. As we become more decentralized, it will become more important to keep this number local.

# Testing
make the big write an read tests work with our 2-postgres setup (supabase and neon).
take the credentials from the toml with databases. Make sure tests get their own _test_ prefix and its own namespace/DB.

# WASM
As much as possible code should be in sync_core wasm

# Backward compatibility
* for now, until further notice, don't worry about backward compatibility - keep the code clean and not polluted with backward compatibility edge cases. I will nuke the DB anyway and I'm the only user for now.