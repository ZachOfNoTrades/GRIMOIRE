# GRIMOIRE Development

## Setup

### SQL Server (Local)

#### Download and Install Software

The following instructions are for setting up a local instance of SQL Server (specifically 2025 edition) for use in development and testing GRIMOIRE.

1. Download and install Microsoft [SQL Server](https://www.microsoft.com/en-us/sql-server). By default, the server is initialized with Windows authentication, and the current user will have access to the engine.

1. Download and install [SSMS](https://learn.microsoft.com/en-us/ssms/install/install).

#### Enable Connection via IP

1. Open **Sql Server Configuration Manager**.

1. Expand the dropdown `SQL Server Network Configuration` and click `Protocols for MSSQLSERVER`.

1. Double click `TCP/IP`.

1. Set **Enabled** to `Yes`. This allows the SQL Server to be accessed via local IP address from the application.

#### Connect to Server

1. Open SSMS.

1. Enter the server name `localhost`.

1. Ensure the **Authentication** method is set to `Windows Authentication`.

1. Enable `Trust Server Certificate`.

1. Click `Connect`.

#### Enable SQL Server Authentication

1. In the Object Explorer, right click on `localhost` > `Properties`.

1. In the left menu, click `Security`.

1. Enable `SQL Server and Windows Authentication Mode`. This will allow connection into the database with a username and password.

### Next.js

#### Prerequisites

- [Node.js](https://nodejs.org/en)

> **Note**: Windows may throw an error when attempting to start the Next.js server due to script permission issues. This can be fixed with a Powershell script - see exact error code for more details.

#### Installation

1. Clone this repository to desired location.
1. Open a terminal in `nextjs/` folder.
1. Execute `npm i` to install node packages.
1. Rename `env.template.local` to `env.local`.
1. Enter all variables in `env.local` from the [Resource Guide](../resources/RESOURCES.md).
1. Run `npm run dev` to start a development server.
1. Run `npm run build` > `npm start` to start a production server.

## Schema Changes

Each `sql/sql_init_<database>.sql` script is the locked base schema, Flyway version 1. It never changes; `sql/flyway/check.sh` fails when one does. Every schema change is a Flyway migration.

1. Add `sql/migrations/<database>/V<version>__<description>.sql`, where `<database>` is `main`, `golem`, `rune`, `quest`, `food` or `health`, `<version>` is the next whole number in that folder, and `<description>` is lowercase words joined by `_`.
1. Write it as plain T-SQL against that database. Flyway runs each migration once, in one transaction, and records it in `dbo.flyway_schema_history`.
1. Guard each change with a check that it is still needed, such as `IF COL_LENGTH(...) IS NOT NULL`. Look up a default or other system-named constraint by name before dropping it, as its name differs between databases.
1. Keep the release before it working. A deploy applies pending migrations before it switches to the new release, and a rollback switches back without undoing them. To remove a column, first ship the code that stops using it, then drop the column in a later release.
1. Run `sql/flyway/check.sh`, then build the databases on a local server with `sql/flyway/build-fresh.sh` (see the [Resource Guide](../resources/RESOURCES.md#create-databases)).

On every push, the `migrations` check builds all six databases from their base schema on a throwaway SQL Server, applies every migration, and checks that a second run applies nothing.

`sql/flyway/migrate.sh <migrate | baseline | info | validate> [database...]` runs a Flyway command on the databases named in `SQL_<DATABASE>_DB`, with the login in `SQL_SERVER_USER` and `SQL_SERVER_PASSWORD`. It runs Flyway from its official Docker image, pinned by digest.

## Code Conventions

### Layout

Each module under `nextjs/app/modules/<slug>/` holds `api/` (routes), `lib/` (queries), `types/`, `components/` and `ui/` (pages).

### Styling

- New code takes its colors from the design system classes in `globals.css`, such as `.btn`, `.card`, `.badge-*` and `.alert-*`, not hex or rgb values or Tailwind color classes in JSX.
- A color no class covers gets a new class in `globals.css`.
- `Button` already applies `btn`, so pass only the variant: `className="btn-blue"`.
- Navigate with `useRouter().push()`, never `window.location.href`.

### Pages

- Group state declarations under `// DATA` (read from the database), `// INPUT` (typed by a user) and `// STATE` (drives the interface, with derived values below it), separated by blank lines.
- Every page and table has a loading placeholder, and every table has an empty-result row.
- Modals sit at the end of the returned JSX.
- A file download shows no success toast.

### API Routes

- A route that needs a signed-in user reads it with `getAuthorizedUser` and answers 401 without one.
- A route only a signed-in browser may use, such as one that manages a user's API keys, reads the session with `getAuthorizedSession`, which an API key cannot pass.
- An empty list from a lib function is returned as is.
- A missing single record answers 404.

### Lib Functions

- An empty list logs a warning and returns: `` console.warn(`No tasks found for user id: '${userId}'`) ``.
- A missing single record returns `null` or throws, and the route answers 404: `` throw new Error(`No module found for id: '${moduleId}'`) ``.
- Values in log and error messages are wrapped in single quotes.

### Database

- Queries are raw SQL through `mssql`, with no ORM, and every value is passed with `.input()`.
- SQL keywords are uppercase; multi-line queries use template literals.
- The global `lib/db.ts` and any module's own `lib/db.ts` keep one shared pool, which callers never close. A module without one uses `getMainConnection`.
- Transactions run `begin()`, then the work, then `commit()`, with `rollback()` on an error.

### Permissions

- Admin-only pages are wrapped in `PermissionGuardServer`, which checks `isAdmin()`, or `PermissionGuardClient`, which checks the session's `globalAdmin` flag.
