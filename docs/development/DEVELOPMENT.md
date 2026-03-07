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
