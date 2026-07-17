# Pipeline Pling

Post GitHub push commit notifications to Discord using the Components V2 message API (Containers, Sections, TextDisplay, and link buttons).

## Features

- Modern **node24** GitHub Action runtime with a minified bundle built by the release workflow
- Discord **Components V2** layout instead of legacy embeds
- Actor-aware header using `sender.login` (merger/pusher), separate from commit authors
- Per-commit lines with linked SHAs, titles, and author/co-author profile links
- Bounded commit body excerpts for commits with descriptions
- Per-message webhook name with higher-resolution sender avatars
- GitHub profile links resolved from usernames or `users.noreply.github.com` emails
- Anonymous commit support via a configurable keyword (default `!anon`)
- Silent commit support via a configurable keyword (default `!silent`) to exclude commits from notifications
- Branch allowlist and denylist for targeting or excluding specific branches
- Skips empty pushes and bot pushes (configurable)
- Clear webhook failure errors on non-2xx responses

## Examples

### Default push

Linked SHAs, commit titles, author lines, per-repo accent color, and a **View changes** button.

![Default push notification](screenshots/default.png)

### Co-authored commits

Multi-commit pushes with linked authors, co-authors, PR references, and quoted commit bodies.

![Co-authored commits](screenshots/coauthors.png)

### Keyword anonymization

Put `!anon` on the first line of the commit body to fully redact that commit. When every commit in the push is anonymous, the **View changes** button is omitted.

![Keyword anonymization](screenshots/keywordanon.png)

### Name anonymization

List GitHub usernames in `name-anon-users` to replace their display names with `Anonymous` while keeping commit details visible.

![Name anonymization](screenshots/nameanon.png)

### Full anonymization

List GitHub usernames in `full-anon-users` to fully redact any commit they author or co-author. Mixed pushes show redacted and normal commits side by side.

![Full anonymization](screenshots/fullanon.png)

### Silent commits

Put `!silent` on the first line of the commit body to exclude that commit from the Discord notification entirely. When every commit in the push is silent, the webhook is not called.

```text
chore(deps): bump lockfile

!silent
```

When only some commits are silent, the notification shows only the remaining commits and uses the filtered commit count in the header (e.g. "is pushing 1 commit" when one non-silent commit remains).

## Usage

```yaml
- name: Notify Discord
  uses: qbox-project/pipeline-pling@v1
  with:
    webhook-url: ${{ secrets.DISCORD_WEBHOOK_URL }}
    thread-id: ${{ vars.DISCORD_THREAD_ID }} # optional
    skip-bots: true # default
    anon-keyword: '!anon' # default
    silent-keyword: '!silent' # default
    branch-allowlist: 'main,develop' # optional
    branch-denylist: 'dependabot' # optional
    accent-color: '#F1E542' # optional
    use-sender-avatar: true # default
    use-repo-username: true # default
    repo-name: 'My Project' # optional display name override
    hide-links: false # default; set true to omit all hyperlinks
    name-anon-users: 'alice,bob' # optional
    full-anon-users: 'secret-user' # optional
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `webhook-url` | yes | | Full Discord webhook URL |
| `thread-id` | no | | Optional forum thread ID |
| `skip-bots` | no | `true` | Skip notifications for bot senders |
| `anon-keyword` | no | `!anon` | Keyword that marks a commit as anonymous in Discord output |
| `silent-keyword` | no | `!silent` | Keyword that excludes a commit from Discord notifications |
| `branch-allowlist` | no | | Comma-separated branch names; when set, only notify for pushes to these branches (case-sensitive exact match) |
| `branch-denylist` | no | | Comma-separated branch names; when set, skip notifications for pushes to these branches (case-sensitive exact match) |
| `accent-color` | no | | Optional hex accent color for the container (e.g. `#F1E542` or `F1E542`). Invalid values log a warning and fall back to a deterministic hash color from the repository name |
| `use-sender-avatar` | no | `true` | When `false`, omit `avatar_url` so Discord uses the webhook's configured avatar |
| `use-repo-username` | no | `true` | When `false`, omit `username` so Discord uses the webhook's configured name |
| `repo-name` | no | | Optional display name override for the webhook username and push header repository label (truncated to 80 characters). Empty or omitted uses the repository name as today |
| `hide-links` | no | `false` | When `true`, omit all hyperlinks from the notification (actor, branch, SHAs, PR refs, author/co-author links, and the View changes button) |
| `name-anon-users` | no | | Comma-separated GitHub usernames whose display names are anonymized in the header, commit author lines, and co-author lines |
| `full-anon-users` | no | | Comma-separated GitHub usernames whose commits are fully redacted when they are the author or a co-author |

## Anonymization

Pipeline Pling supports three complementary anonymization modes. They can be combined in the same workflow.

### Keyword anonymization (`anon-keyword`)

If a commit message puts the anonymous keyword on the first line of the commit body, Discord output redacts the commit title, body, SHA, links, and all author/co-author/committer details. Anonymous commits render as `` `Anonymous commit` ``.

Example:

```text
fix(items.lua): typo but also no

!anon
```

When every commit in the push is anonymous, commit details are still redacted and the **View changes** button is omitted.

When only some commits are anonymous, non-anonymous commits render normally, but branch and compare links are still omitted so anonymous commits cannot be discovered from the notification.

### Name anonymization (`name-anon-users`)

Provide a comma-separated list of GitHub usernames. Matching is case-insensitive and ignores empty entries.

When a listed user appears as the push sender, commit author, or co-author, their display name is rendered as `Anonymous` with no profile hyperlink. Commit SHAs, titles, and descriptions still render normally unless another anonymization mode applies.

When a listed user is the push sender and avatars are enabled (`use-sender-avatar: true`), the notification uses the anonymous silhouette avatar instead of their GitHub profile picture.

### Full anonymization (`full-anon-users`)

Provide a comma-separated list of GitHub usernames. Any commit whose author or co-author matches a listed user is fully redacted exactly like keyword anonymization: `` `Anonymous commit` `` with no SHA, title, description, or profile links.

When a listed user is the push sender, the header actor becomes `**Anonymous**` (no link) and the anonymous avatar is used when avatars are enabled.

A commit is treated as anonymous if **either** the keyword matches **or** the author/co-author is in the full-anon list. Mixed pushes omit the **View changes** button and use a plain branch label when any commit is anonymous.

### Silent commits (`silent-keyword`)

If a commit message puts the silent keyword on the first line of the commit body, that commit is excluded from the Discord notification. Silent commits are removed before the message is built; they do not appear as redacted placeholders.

Example:

```text
chore(deps): bump lockfile

!silent
```

When every commit in the push is silent, the action logs `All commits in push are silent; skipping.` and does not call the webhook.

When only some commits are silent, the notification includes only the non-silent commits. The header uses the filtered count (singular `commit` when exactly one remains).

Silent commits are independent of anonymization: a commit can be both silent and anonymous, but silent takes precedence by excluding the commit entirely.

### Branch filtering (`branch-allowlist`, `branch-denylist`)

Provide comma-separated branch names to control which pushes trigger notifications. Branch names are matched exactly against the parsed push ref (e.g. `refs/heads/main` → `main`). Matching is **case-sensitive**.

- **`branch-allowlist`**: when non-empty, only pushes to listed branches notify.
- **`branch-denylist`**: when non-empty, pushes to listed branches are skipped.

When both are set, a branch must pass the allowlist **and** not be in the denylist. An empty or omitted list is ignored.

## Development

```bash
npm ci
npm run check
```

`npm run check` runs typecheck, Vitest, and esbuild. The `dist/` directory is gitignored; when you publish a GitHub release, the release workflow builds a minified `dist/index.js`, commits it to the release tag, and updates the floating major tag (e.g. `v1`).

### Releasing

1. Create a GitHub release with a semver tag such as `v1.2.3`.
2. The release workflow runs typecheck, tests, and a minified build, then commits `dist/index.js` to the release tag and force-pushes it.
3. The workflow also force-updates the floating major tag (e.g. `v1.2.3` → `v1`) so consumers can pin `@v1`.

## Local workflow testing with act

[`act`](https://github.com/nektos/act) runs GitHub Actions locally in Docker, so you can test the Discord workflow without pushing.

On Windows, install `act` with one of:

```powershell
winget install nektos.act
# or
choco install act-cli
```

Create a local secret file and add your Discord webhook URL:

```powershell
Copy-Item .secrets.example .secrets
notepad .secrets
```

The `.secrets` file is gitignored. Do not commit real webhook URLs.

Run all local workflow fixtures with one command:

```bash
npm run act:test
```

This builds `dist/index.js` automatically, then runs six scenarios sequentially through act using `.secrets`. Each scenario posts a real Discord message so you can visually inspect the output — see [Examples](#examples) for reference screenshots. The script exits non-zero if the build fails, `.secrets` is missing, or any scenario fails.

| Scenario | Workflow | Fixture | What to look for |
| --- | --- | --- | --- |
| `push` | `discord-push.yml` | `push.json` | Default inputs — linked authors, repo hash accent color, sender avatar and repo username |
| `push-anon` | `discord-push.yml` | `push-anon.json` | Keyword anonymization (`!anon`) — redacted commits, no View changes button |
| `push-coauthors` | `discord-push.yml` | `push-coauthors.json` | Co-authored commits with linked author and co-author lines |
| `push-name-anon` | `discord-push-name-anon.yml` | `push-name-anon.json` | `name-anon-users: ChatDisabled,WhereiamL` — Anonymous header/avatars/names, commits still visible; includes co-author |
| `push-full-anon` | `discord-push-full-anon.yml` | `push-full-anon.json` | `full-anon-users: WhereiamL` — one fully redacted commit mixed with a normal commit |
| `push-custom` | `discord-push-custom.yml` | `push.json` | `accent-color: #E74C3C`, `use-sender-avatar: false`, `use-repo-username: false` — red accent, webhook default name/avatar |

All Discord push workflows (`discord-push.yml`, `discord-push-name-anon.yml`, `discord-push-full-anon.yml`, `discord-push-custom.yml`) are act-only test fixtures with placeholder branch filters (`__act_only_*__`), so they never run on real pushes.

The first run may take a while because Docker pulls the local runner image.

Optional direct `act` commands for debugging a single scenario:

```powershell
act push -W .github/workflows/discord-push.yml --eventpath fixtures/push.json --secret-file .secrets
act push -W .github/workflows/discord-push-name-anon.yml --eventpath fixtures/push-name-anon.json --secret-file .secrets
act push -W .github/workflows/discord-push-full-anon.yml --eventpath fixtures/push-full-anon.json --secret-file .secrets
act push -W .github/workflows/discord-push-custom.yml --eventpath fixtures/push.json --secret-file .secrets
```

## License

MIT
