# Pipeline Pling

Post GitHub push commit notifications to Discord using the Components V2 message API (Containers, Sections, TextDisplay, and link buttons).

## Features

- Modern **node24** GitHub Action runtime with a bundled `dist/index.js`
- Discord **Components V2** layout instead of legacy embeds
- Actor-aware header using `sender.login` (merger/pusher), separate from commit authors
- Per-commit lines with linked SHAs, titles, and author/co-author profile links
- Bounded commit body excerpts for commits with descriptions
- Per-message webhook name with higher-resolution sender avatars
- GitHub profile links resolved from usernames or `users.noreply.github.com` emails
- Anonymous commit support via a configurable keyword (default `!anon`)
- Skips empty pushes and bot pushes (configurable)
- Clear webhook failure errors on non-2xx responses

## Usage

```yaml
- name: Notify Discord
  uses: qbox-project/pipeline-pling@v1
  with:
    webhook-url: ${{ secrets.DISCORD_WEBHOOK_URL }}
    thread-id: ${{ vars.DISCORD_THREAD_ID }} # optional
    skip-bots: true # default
    anon-keyword: '!anon' # default
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `webhook-url` | yes | | Full Discord webhook URL |
| `thread-id` | no | | Optional forum thread ID |
| `skip-bots` | no | `true` | Skip notifications for bot senders |
| `anon-keyword` | no | `!anon` | Keyword that marks a commit as anonymous in Discord output |

## Anonymous commits

If a commit message contains the anonymous keyword, Discord output redacts the commit title, body, SHA, links, and all author/co-author/committer details. Anonymous commits render as `` `Anonymous commit` `` or `` `Anonymous commit #N` ``.

When every commit in the push is anonymous:

- The header actor becomes **Anonymous**
- The avatar becomes a generic silhouette
- The **View changes** button is omitted

When only some commits are anonymous, non-anonymous commits render normally, but compare links are still omitted so anonymous commits cannot be discovered from the notification.

## Development

```bash
npm ci
npm run check
```

`npm run check` runs typecheck, Vitest, and esbuild. Commit the generated `dist/index.js` so the action runs without a checkout-time build step.

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

This runs `fixtures/push.json`, `fixtures/push-anon.json`, and `fixtures/push-coauthors.json` sequentially through `.github/workflows/discord-push.yml` using `.secrets`. The script exits non-zero if `.secrets` is missing or any fixture run fails.

The first run may take a while because Docker pulls the local runner image.

Optional direct `act` commands for debugging a single fixture:

```powershell
act push -W .github/workflows/discord-push.yml --eventpath fixtures/push.json --secret-file .secrets
act push -W .github/workflows/discord-push.yml --eventpath fixtures/push-anon.json --secret-file .secrets
act push -W .github/workflows/discord-push.yml --eventpath fixtures/push-coauthors.json --secret-file .secrets
```

## License

MIT
