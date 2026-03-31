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
- [_**RUNE Piper Binary Path**_](#piper-tts)
- [_**RUNE Piper Model Path**_](#piper-tts)
- [_**RUNE Piper Length Scale**_](#piper-tts)
- [_**RUNE Piper Sentence Silence**_](#piper-tts)
- [_**RUNE Whisper Binary Path**_](#whisper-stt)
- [_**RUNE Whisper Model Path**_](#whisper-stt)
- [_**RUNE Silence Timeout**_](#whisper-stt)
- [_**RUNE Keep Temp Files**_](#whisper-stt)

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

## RUNE

### Create RUNE Database

1. Connect to the server via desired SQL client (e.g., SQL Server Management Studio).
1. Execute `sql_init_rune.sql` from the `sql/` folder.

### Voice Controls

RUNE voice controls require two local CLI binaries: Piper (TTS) and Whisper (STT). Both run as subprocesses spawned by the Node.js server — no cloud API calls are made.

#### Piper TTS

[Piper](https://github.com/rhasspy/piper) is a fast local neural text-to-speech engine.

1. Download a Piper release for the deployment platform from [GitHub Releases](https://github.com/rhasspy/piper/releases).
1. Extract the binary (e.g., `piper.exe`) to a project directory (e.g., `C:/tools/piper/`).
1. Download a voice model (`.onnx` + `.onnx.json`) from [Piper Voices](https://huggingface.co/rhasspy/piper-voices). Recommended: `en_US-lessac-high`.
1. Place the model files in the same directory as the binary.
1. Set the following environment variables:
   - _**RUNE Piper Binary Path**_ (`PIPER_BINARY_PATH`): Full path to the Piper executable.
   - _**RUNE Piper Model Path**_ (`PIPER_MODEL_PATH`): Full path to the `.onnx` voice model file.
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
   - _**RUNE Whisper Binary Path**_ (`WHISPER_BINARY_PATH`): Full path to the Whisper executable.
   - _**RUNE Whisper Model Path**_ (`WHISPER_MODEL_PATH`): Full path to the `.bin` model file.
1. Optional:
   - `NEXT_PUBLIC_SILENCE_TIMEOUT_MS`: Auto-stop recording after this many milliseconds of silence. Default `5000`.
