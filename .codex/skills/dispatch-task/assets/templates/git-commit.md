# Git Commit Template

```text
Phase 0 Snapshot Commit:
- branch:
- dirty_before_start: yes / no
- committed: yes / no
- commit_hash:
- commit_message: <= 50 chars
- base_ref:
- blocked_reason:
```

```text
Git Commit:
- branch:
- committed: yes / no
- commit_hash:
- commit_message: <= 50 chars
- staged_files:
- excluded_dirty_files:
- 未提交原因:
```

## git-completion-policy-01

Source: `references/git-completion-policy.md`  
Context: 定位

```text
../assets/templates/git-commit.md
```

## git-completion-policy-02

Source: `references/git-completion-policy.md`  
Context: Phase 0 Git baseline

```bash
git status --short
git branch --show-current
```

## git-completion-policy-03

Source: `references/git-completion-policy.md`  
Context: Phase 0 Git baseline

```bash
git add -A
git commit -m "<message>"
git rev-parse HEAD
git status --short
```

## git-completion-policy-04

Source: `references/git-completion-policy.md`  
Context: commit message 规则

```text
chore: snapshot local changes
chore: snapshot ui edits
fix: align care timeline UI
docs: update dispatch gates
```

## git-completion-policy-05

Source: `references/git-completion-policy.md`  
Context: 输出

```text
../assets/templates/git-commit.md
```
