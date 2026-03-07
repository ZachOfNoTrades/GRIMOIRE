# GRIMOIRE Modules

This page provides details on all the available modules in GRIMOIRE.

# Table of Contents

- [GOLEM - Workout Tracker and Generator]()

# Module Overview

## GOLEM

GOLEM is a LLM-backed workout program generator and tracking app. Spanning full month-long programs down to recommended set RPE, all facets of exercise are configurable via templates, prompts, and conversation with the desired AI of choice.

### Key Features

- **Session Tracking**: A fully-fledged tracker on its own, it has the ability to track sessions, exercises, notes, RPEs.
- **Prompts and Templates**: A unique markdown-style prompt is configurable from the UI to give instructions to the LLM, including all levels between full program and individual sessions. A user profile is also provided.
- **LLM Generation**: An LLM is used to generate all levels of a regiment, including the exercises and session notes. It uses prompt, user profile, and the surrounding workout notes as context to build.
- **SQL Skill**: The LLM has the ability to think and execute its own SQL queries on demand to build better.
- **CSV Import**: Import history from other apps with a robust mapping system to support different exercise names between different systems.

### How to Use

> Review the prompts in `/nextjs/app/modules/golem/lib/prompts` to better understand what the LLM sees.

1. Create a program template - enter desired prompt for the program, week, and session.
1. Enter a user profile. Anything that the LLM should take into context, like preferences and injury history.
1. Generate a program using a template. The first week of sessions are also automatically generated.
1. Open the first session, modify the generated session notes as desired (as the LLM takes that into context), and generate the exercises.
1. Open an exercise, log details, and mark sets as complete as you go.
1. Mark the session as complete once done.
