---
allowed-tools: Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*),Bash(gh api:*)
description: Review a pull request with specialized agents (architecture, code quality, test coverage, security, documentation)
---

Review the pull request specified by $ARGUMENTS (PR number or URL).

## Step 1: Gather PR Information

Run these commands to understand the PR:

```
gh pr view $ARGUMENTS --json title,body,baseRefName,headRefName,files,additions,deletions
gh pr diff $ARGUMENTS
```

## Step 2: Launch Review Agents in Parallel

Use the Task tool to launch ALL FIVE review agents simultaneously. Each agent should receive:
- The full PR diff
- The list of changed files
- The PR title and description for context

Launch these agents in parallel:

1. **architecture-reviewer**: Check Hexagonal Architecture compliance — dependency direction, Port/Adapter boundaries, DI patterns
2. **code-quality-reviewer**: Check code quality, TypeScript practices, and RUNBOOK invariant rule compliance
3. **test-coverage-reviewer**: Check test coverage, Bun test patterns, and in-memory adapter test strategy
4. **security-code-reviewer**: Check for secrets leakage, prompt injection risks, and input validation
5. **documentation-reviewer**: Check CLAUDE.md accuracy, docs/*.md sync with code, and inline comment quality

For each agent, provide this context in the prompt:
- The PR diff output
- The list of changed files
- Instruction to read full files as needed for context

## Step 3: Collect and Synthesize Results

After all agents complete, synthesize their findings into a unified review.

## Step 4: Post Review Comments

### Inline Comments (for specific issues)

For each CRITICAL or WARNING finding with a specific file and line:

First, resolve the repository owner/name and PR number:
```
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
PR_NUMBER=$(gh pr view $ARGUMENTS --json number -q .number)
COMMIT_ID=$(gh pr view $ARGUMENTS --json headRefOid -q .headRefOid)
```

Then post inline comments:
```
gh api repos/$REPO/pulls/$PR_NUMBER/comments \
  -f body="**[SEVERITY]** description" \
  -f path="file/path.ts" \
  -F line=LINE_NUMBER \
  -f commit_id="$COMMIT_ID"
```

### Summary Comment

Post a comprehensive summary comment on the PR:

```
gh pr comment $ARGUMENTS --body "REVIEW_BODY"
```

The summary comment should follow this format:

```markdown
## PR Review Summary

### Architecture Review
[Key findings or "No issues found"]

### Code Quality Review
[Key findings or "No issues found"]

### Test Coverage Review
[Key findings or "No issues found"]

### Security Review
[Key findings or "No issues found"]

### Documentation Review
[Key findings or "No issues found"]

### Overall Assessment
- **CRITICAL issues**: N
- **Warnings**: N
- **Info/Suggestions**: N

[Overall recommendation: Approve / Request Changes / Needs Discussion]

---
*Reviewed by fenghuang PR Review Agents*
```

## Important Notes

- If $ARGUMENTS is empty, check the current branch and find the associated PR
- For large PRs (50+ files), prioritize reviewing `src/core/` and `src/ports/` changes first
- Always read the full file when reviewing architecture boundaries — diffs alone can miss context
- Be constructive: provide specific fix suggestions, not just criticism
