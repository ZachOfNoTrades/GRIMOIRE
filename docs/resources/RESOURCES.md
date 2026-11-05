# GRIMOIRE Resource Setup Guide

## Table of Contents

- [Frontend](#frontend)
- [Database](#database)

The following lists all credentials that will be created during this setup. Use these standardized names when referencing environment variables/credentials in other documentation:

### Database

- [_**SQL Server URL**_](#create-sql-server-instance)
- [_**SQL Server User**_](#create-sql-server-instance)
- [_**SQL Server Password**_](#create-sql-server-instance)
- [_**SQL Main Database**_](#create-databases) (`SQL_MAIN_DB`)
- [_**SQL Golem Database**_](#create-databases) (`SQL_GOLEM_DB`)
- [_**SQL Rune Database**_](#create-databases) (`SQL_RUNE_DB`)
- [_**SQL Quest Database**_](#create-databases) (`SQL_QUEST_DB`)
- [_**SQL Food Database**_](#create-databases) (`SQL_FOOD_DB`)
- [_**SQL Health Database**_](#create-databases) (`SQL_HEALTH_DB`)

### Modules

- [_**Golem LLM Provider**_](#golem)
- ~~[_**Golem LLM Server URL**_]()~~
- ~~[_**Golem LLM Model**_]()~~
- [_**Rune Piper Binary Path**_](#piper-tts)
- [_**Rune Piper Model Path**_](#piper-tts)
- [_**Rune Piper Length Scale**_](#piper-tts)
- [_**Rune Piper Sentence Silence**_](#piper-tts)
- [_**Rune Whisper Binary Path**_](#whisper-stt)
- [_**Rune Whisper Model Path**_](#whisper-stt)
- [_**Rune Silence Timeout**_](#whisper-stt)
- [_**Rune Keep Temp Files**_](#whisper-stt)

# Frontend

GRIMOIRE uses Next.js, an easily deployable framework to a Virtual Machine or a hosting platform like Vercel. There is currently no officially supported production recommendation while the application is in Alpha, please refer to the [Development Guide](../development/DEVELOPMENT.md) for a local installation.

# Database

GRIMOIRE uses Microsoft SQL Server. There is currently no officially supported production recommendation while the application is in Alpha, please refer to the [Development Guide](../development/DEVELOPMENT.md) for a local installation.

While GRIMOIRE is in Alpha, the [Development Guide](../development/DEVELOPMENT.md) outlines the recommended procedure for creating the SQL Server resource. Proficiency with MSSQL and SSMS are recommended to create the _**SQL Server URL**_, _**SQL Server User**_, and _**SQL Server Password**_.

### Create Databases

Each database is built from its `sql/sql_init_<database>.sql` script, the locked base schema, and then brought up to date by the Flyway migrations in `sql/migrations/<database>/`. `sql/flyway/build-fresh.sh` does both for all six databases, and needs Bash, Docker and `sqlcmd`.

1. Set _**SQL Server URL**_ (`SQL_SERVER_URL`, the host), `SQL_SERVER_PORT` if it is not 1433, and the six database names above.
1. Set `SQL_SERVER_USER` and `SQL_SERVER_PASSWORD` to a login that may create databases, and `SQLCMDPASSWORD` to the same password.
1. Set `SQLCMD` to the `sqlcmd` command that reaches the server as that login, such as `sqlcmd -S localhost -U sa -No`.
1. Run `sql/flyway/build-fresh.sh`. It refuses a database that already exists.
1. Give the app's login _**SQL Server User**_ `db_owner` on each database. Deploys apply new migrations with this login.

# Modules

## Golem

The Golem workout tracker uses a local or cloud LLM for generation services. In the current Alpha build, only Claude Code via CLI is supported.

### Claude Code

1. Install Claude Code per their [documentation](https://code.claude.com/docs/en/overview).
1. Configure Claude Code with an Anthropic account. The application works with both subscription and API.
1. If using Claude Code, the _**Golem LLM Provider**_ is `claude-code`.

## Rune

### Voice Controls

Rune voice controls require two local CLI binaries: Piper (TTS) and Whisper (STT). Both run as subprocesses spawned by the Node.js server — no cloud API calls are made.

#### Piper TTS

[Piper](https://github.com/rhasspy/piper) is a fast local neural text-to-speech engine.

1. Download a Piper release for the deployment platform from [GitHub Releases](https://github.com/rhasspy/piper/releases).
1. Extract the binary (e.g., `piper.exe`) to a project directory (e.g., `C:/tools/piper/`).
1. Download a voice model (`.onnx` + `.onnx.json`) from [Piper Voices](https://huggingface.co/rhasspy/piper-voices). Recommended: `en_US-lessac-high`.
1. Place the model files in the same directory as the binary.
1. Set the following environment variables:
   - _**Rune Piper Binary Path**_ (`PIPER_BINARY_PATH`): Full path to the Piper executable.
   - _**Rune Piper Model Path**_ (`PIPER_MODEL_PATH`): Full path to the `.onnx` voice model file.
1. Optional tuning variables:
   - `PIPER_LENGTH_SCALE`: Speech rate. Default `1.0`. Lower is faster, higher is slower.
   - `PIPER_SENTENCE_SILENCE`: Pause between sentences in seconds. Default `0.2`.

#### Whisper STT

[whisper.cpp](https://github.com/ggerganov/whisper.cpp) is a local Whisper speech-to-text inference engine.

1. Download a whisper.cpp release from [GitHub Releases](https://github.com/ggerganov/whisper.cpp/releases). Use the `whisper-bin-x64` package for Windows.
1. Extract the binary (e.g., `whisper-cli.exe`) to a tools directory (e.g., `C:/tools/whisper/`).
1. Download a GGML model from [Hugging Face](https://huggingface.co/ggerganov/whisper.cpp). Recommended: `ggml-small.en.bin` for English-only with good accuracy.
1. Place the model file in the same directory as the binary.
1. Set the following environment variables:
   - _**Rune Whisper Binary Path**_ (`WHISPER_BINARY_PATH`): Full path to the Whisper executable.
   - _**Rune Whisper Model Path**_ (`WHISPER_MODEL_PATH`): Full path to the `.bin` model file.
