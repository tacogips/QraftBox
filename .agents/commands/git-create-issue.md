---
allowed-tools: Bash(gh issue:*), Bash(gh repo:*), Bash(git remote:*), Bash(git branch:*)
description: Create a GitHub issue for the current repository
---

## Context

- Repository remote URL: !`git remote get-url origin 2>/dev/null || echo "No remote configured"`
- Current branch: !`git branch --show-current 2>/dev/null || echo "Not in a git repository"`
- Repository info: !`gh repo view --json name,owner,description 2>/dev/null || echo "Unable to get repo info (not authenticated or not a GitHub repo)"`

## Your task

Create a GitHub issue for the current repository using the `gh` CLI.

Arguments provided: $ARGUMENTS

### Instructions

1. **Parse arguments**:
   - If `$ARGUMENTS` is empty, ask the user for issue title and description interactively
   - If `$ARGUMENTS` contains text, parse it as follows:
     - `Title: <title>` - Issue title (required if creating directly)
     - `Body: <body>` or `Desc: <description>` - Issue body/description
     - `Labels: <label1>,<label2>` - Comma-separated labels to apply
     - `Assignee: <username>` - Assign to a user
     - `Milestone: <milestone>` - Add to a milestone
     - `Project: <project>` - Add to a project
   - If only plain text is provided without prefixes, treat it as the issue title

2. **Validate prerequisites**:
   - Confirm this is a git repository with a GitHub remote
   - Verify `gh` CLI is authenticated (if not, inform the user to run `gh auth login`)

3. **Interactive mode (when no arguments)**:
   - Ask the user for:
     - Issue title (required)
     - Issue description/body (optional, can be multi-line)
     - Labels (optional)
   - Use the AskUserQuestion tool for this interaction

4. **Create the issue**:
   - Use `gh issue create` command with appropriate flags:
     ```
     gh issue create --title "<title>" --body "<body>" [--label "<label>"] [--assignee "<user>"] [--milestone "<milestone>"] [--project "<project>"]
     ```
   - If body is not provided, use `--body ""` or omit for gh to open an editor

5. **Display results**:
   - Show the created issue URL
   - Show the issue number
   - Show the title and any applied labels

### Example Usage

```
/git-create-issue
# Interactive mode - will ask for title and description

/git-create-issue Fix login button not working on mobile
# Creates issue with title "Fix login button not working on mobile"

/git-create-issue Title: Add dark mode support Body: Users have requested a dark mode theme for better night-time usage Labels: enhancement,ui
# Creates issue with full details

/git-create-issue Title: Bug in authentication Labels: bug,high-priority Assignee: octocat
# Creates issue with labels and assignee
```

### Example Output

```
Creating GitHub issue...

Repository: owner/repo-name
Title: Fix login button not working on mobile
Labels: bug

Issue created successfully!
URL: https://github.com/owner/repo-name/issues/42
Issue #42: Fix login button not working on mobile
```

### Notes

- Requires `gh` CLI to be installed and authenticated
- Run `gh auth login` if not authenticated
- Labels must exist in the repository to be applied
- Use `gh label list` to see available labels
- This command works with any GitHub repository (public or private with proper access)
