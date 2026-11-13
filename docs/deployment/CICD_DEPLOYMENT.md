# CI/CD Deployment

## Document Information

### Scope

This document covers checking, releasing and deploying GRIMOIRE through GitHub Actions.

## Overview

| Workflow | Trigger | Runner | Result |
| --- | --- | --- | --- |
| `check` (`.github/workflows/check.yml`) | Push to any branch, pull request | GitHub-hosted | Typechecks, runs the regression checks and builds the app, and builds every database from its base schema and migrations on a throwaway SQL Server. |
| `release` (`.github/workflows/release.yml`) | Called by `deploy`, manual run from a version tag | GitHub-hosted | Waits for the commit's `check` run to pass, then publishes a GitHub release for the tag with the commits since the release before it as its notes. |
| `deploy` (`.github/workflows/deploy.yml`) | Schedule, manual run | GitHub-hosted, then self-hosted on the host | Picks the highest version tag with no label, runs `release` for it, then starts the host's deploy service. |

- A published release never changes. A release whose deploy fails is fixed under the next patch version.
- The release carries no package: the host builds the released tag itself, following its commit.

## Targets

The host is the one target, `prod`. A version tag with no label, such as `0.7.0`, deploys to it. A tag with a label, such as `0.7.0-dev.1`, is released as a prerelease and not deployed. Every deploy runs the scheduled pipeline, nightly at 03:15 Central time. The host deploys the highest tag with no label when it is higher than the active release and was never installed before, so a version that failed its health check or was rolled back is not retried. A pushed tag starts nothing on its own.

## Configuration

The workflows read no secrets. Their jobs use the run's own token.

| Setting | Lives in | Read by |
| --- | --- | --- |
| Runner label `grimoire` | The runner's registration | `deploy` |
| `grimoire-deploy.service` and the launcher `deploy/grimoire-deploy-launcher.sh`, installed as `grimoire-deploy` | The host | `deploy`, through one sudoers rule that allows only starting the service |
| Deploy script settings (`deploy.env`) | The host | `deploy/grimoire-deploy.sh` |
| Database and app settings | The host's secrets manager, read by the deploy script and the app | The host |

## Deployment Model

- The launcher on the host fetches `unstable` and runs `deploy/grimoire-deploy.sh` from it, so every deploy uses the reviewed script, whatever tag it deploys.
- The deploy script builds the tag's commit into its own release directory, named for the version, and applies the release's pending Flyway migrations with `sql/flyway/migrate.sh`. A failed migration stops the deploy with the live release unchanged.
- It then points `current` at the release and restarts the app, keeping the release only when an API request that reads the app's database answers twice, and otherwise pointing `current` back at the release before it.
- Uploaded files and other data the app keeps sit outside the release directories, linked into each release.

## Release Procedure

1. Merge the work into `unstable` and push it, then wait for its `check` run to pass:
   ```
   gh run watch --repo {owner}/{repo}
   ```
1. Tag the merge commit with the next version, and push the tag:
   ```
   git tag {version} {commit}
   git push origin {version}

   # Example
   git tag 0.7.1 4f2a9c1
   git push origin 0.7.1
   ```
1. Wait for the next scheduled `deploy` run, or start one now:
   ```
   gh workflow run deploy --repo {owner}/{repo} --ref unstable
   ```
1. Check the active release on the host:
   ```
   grimoire-deploy --status
   ```

## Pipeline Operations

1. Deploy a named version now, even one that is not the highest or was installed before, on the host:
   ```
   grimoire-deploy --tag {version}
   ```
1. Roll back to the release that was live before the current one, on the host:
   ```
   grimoire-deploy --rollback
   ```
