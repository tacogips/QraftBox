---
name: release-workflow
description: Execute QraftBox release operations end-to-end using Taskfile tasks, including GitHub Release and npm publish. Use when users ask to release, publish a version, or run post-merge release operations.
allowed-tools: Bash, Read, Write, Grep, Glob
---

# Release Workflow Skill

This skill standardizes release execution for QraftBox using the repository Taskfile.

## When to Apply

Apply this skill when the user asks to:
- release a merged version
- publish artifacts
- publish to npm
- run GitHub release operations

## Release Contract

In this repository, interpret an unscoped "release" request as:
1. GitHub Release publish
2. npm publish

If the user explicitly says GitHub-only or npm-only, run only the requested scope.

## Preconditions

1. Ensure branch is up to date and clean.
2. Ensure `package.json` version is the intended release version.
3. Ensure required auth is valid:
   - `gh auth status`
   - npm auth/token for publish (`NPM_TOKEN` environment variable)
4. Ensure dependencies are installed: `bun install`.

## npm Auth Standard

Use `NPM_TOKEN` environment variable for all npm publish flows.

```bash
export NPM_TOKEN=xxxx
TMP_NPMRC=$(mktemp)
cat > "$TMP_NPMRC" <<'EOF'
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
EOF
NPM_CONFIG_USERCONFIG="$TMP_NPMRC" <publish command>
rm -f "$TMP_NPMRC"
```

Do not hardcode tokens in committed files.

## Standard Commands

### Full Release (GitHub + npm)

```bash
task release:github
task release:npm-publish
```

### GitHub Release Only

```bash
task release:github
```

### npm Publish Only

```bash
task release:npm
cd release/npm
NPM_CONFIG_USERCONFIG="$TMP_NPMRC" bunx npm publish --access public
```

## Verification Checklist

After release commands finish:
1. Confirm GitHub release URL exists for `v{version}`.
2. Confirm tag points to expected commit on origin.
3. Confirm npm package/version is published.
4. Confirm working tree remains clean.

For npm verification, prefer direct registry metadata:

```bash
curl -s https://registry.npmjs.org/qraftbox/latest
```

(`npm view` may temporarily show stale/cached values right after publish.)

## Failure Handling

1. If version/tag mismatch exists, fix `package.json` version first and commit.
2. If local environment was scrubbed (`git clean -fdX`), reinstall deps before release.
3. If GitHub release already exists, skip recreate and verify uploaded artifacts.
4. If npm publish fails due to existing version, report clearly and stop retry loops.
5. If `task release:npm-publish` fails with `"npm": executable file not found`, switch to:
   - `task release:npm`
   - `cd release/npm && bunx npm publish --access public`
6. If npm publish fails with `EOTP`:
   - Use an automation/granular token that supports non-interactive publish, exported as `NPM_TOKEN`
   - Or provide OTP and publish with `--otp <code>`
