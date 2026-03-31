## Radicle Authorization Rules (from heartwood source)

### General principle
Every COB action goes through `authorization()` before being applied. **Delegates** (as defined in the repository identity document) are authorized to perform **all actions**. Non-delegates have restricted permissions described below.

### Who can create issues and patches?
- **Anyone** (any peer) can create a new issue or patch. The root operation (first comment for issues, first revision for patches) bypasses authorization checks.

### Issue permissions (`xyz.radicle.issue`)

| Action | Allowed for |
|---|---|
| Create issue | Everyone |
| `Label` (set labels) | **Delegates only** |
| `Assign` (set assignees) | **Delegates only** |
| `Edit` (change title) | Issue author only |
| `Lifecycle` (open/close) | Issue author only |
| `Comment` | Everyone |
| `CommentEdit` | Comment author only |
| `CommentRedact` | Comment author only |
| `CommentReact` | Everyone |

### Patch permissions (`xyz.radicle.patch`)

| Action | Allowed for |
|---|---|
| Create patch | Everyone |
| `Label` | **Delegates only** |
| `Assign` | **Delegates only** |
| `Merge` | **Delegates only** |
| `Edit` (title/target) | Patch author only |
| `Lifecycle` (open/draft/archive) | Patch author only |
| `Revision` (new revision) | Everyone |
| `RevisionEdit` | Revision author only |
| `RevisionRedact` | Revision author only |
| `Review` | Everyone |
| `ReviewRedact` | Review author only |
| `ReviewEdit` | Review author only |
| `ReviewComment` | Everyone |
| `ReviewCommentEdit/Redact` | Comment author only |
| `ReviewCommentResolve/Unresolve` | Comment author, reviewer, or revision author |
| `RevisionComment` | Everyone |
| `RevisionCommentEdit/Redact` | Comment author only |

### Authorization is compile-time, not configurable
These rules are **hardcoded in Rust** inside `Issue::authorization()` and `Patch::authorization()`. There is no per-repository ACL configuration. To change authorization logic, you must implement a **custom COB type** with its own `Evaluate` implementation.

### "Unknown" authorization outcome
If the target object of an action has been concurrently redacted (e.g. editing a comment that was deleted), the authorization returns `Unknown` and the action is silently ignored rather than rejected.