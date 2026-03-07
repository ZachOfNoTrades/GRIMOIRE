# GRIMOIRE Resource Setup Guide

## Table of Contents

- [Frontend](#frontend)
- [Database](#database)

The following lists all credentials that will be created during this setup. Use these standardized names when referencing environment variables/credentials in other documentation:

### Database

- [_**SQL Server URL**_](#create-sql-server-instance)
- [_**SQL Server User**_](#create-sql-server-instance)
- [_**SQL Server Password**_](#create-sql-server-instance)
- [_**SQL GOLEM Database**_](#create-golem-database)

### Modules

- [_**GOLEM LLM Provider**_](#golem)
- ~~[_**GOLEM LLM Server URL**_]()~~
- ~~[_**GOLEM LLM Model**_]()~~

# Frontend

GRIMOIRE uses Next.js, an easily deployable framework to a Virtual Machine or a hosting platform like Vercel. There is currently no officially supported production recommendation while the application is in Alpha, please refer to the [Development Guide](../development/DEVELOPMENT.md) for a local installation.

# Database

GRIMOIRE uses Microsoft SQL Server. There is currently no officially supported production recommendation while the application is in Alpha, please refer to the [Development Guide](../development/DEVELOPMENT.md) for a local installation.

While GRIMOIRE is in Alpha, the [Development Guide](../development/DEVELOPMENT.md) outlines the recommended procedure for creating the SQL Server resource. Proficiency with MSSQL and SSMS are recommended to create the _**SQL Server URL**_, _**SQL Server User**_, and _**SQL Server Password**_.

### Create GOLEM Database

1. Connect to the server via desired SQL client (e.g., SQL Server Management Studio).
1. Execute `sql_init_golem.sql` from the `sql/` folder.
1. Execute `sql_init_golem_exercises.sql` to seed the exercise list.

# Modules

## GOLEM

The GOLEM workout tracker uses a local or cloud LLM for generation services. In the current Alpha build, only Claude Code via CLI is supported.

### Claude Code

1. Install Claude Code per their [documentation](https://code.claude.com/docs/en/overview).
1. Configure Claude Code with an Anthropic account. The application works with both subscription and API.
1. If using Claude Code, the _**GOLEM LLM Provider**_ is `claude-code`.
