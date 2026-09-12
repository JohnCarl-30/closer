# Closer

A post-ship agent. Paste a merged GitHub PR. It finds the Linear issue, marks it Done with the PR link, emails whoever asked, then reads both apps again. A 200 from Gmail is not enough. The message has to show up in sent mail.

If the PR-to-issue match or the recipient is shaky, it escalates and writes nothing. If two Linear tickets both fit, you pick one before it writes. The silent-200 button is a mock-only replay that proves a Gmail 200 is not enough.

## Run

```bash
cp secrets.example .dev.vars
npm install
npm run eval
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) (or the port Vite prints). With empty `.dev.vars` it uses the in-memory demo apps. The demo PR URL is already in the box.

## Keys

Put these in `.dev.vars` when you want live writes:

```
GITHUB_TOKEN=
LINEAR_API_KEY=
LINEAR_DONE_STATE_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
```

GitHub needs `repo` on the demo repo. Linear needs a Done state id from the team's workflow. Gmail needs a refresh token with `gmail.send` and `gmail.readonly`. If GitHub and Linear are set but Gmail is not, sends are mocked and the verify path stays the same.

```bash
# after pasting LINEAR_API_KEY into .dev.vars
npm run seed:linear

# after pasting GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
npm run seed:gmail
```

## Tests

```bash
npm test
npm run eval
```

Unit tests cover matching, the confidence gate, 429 retries, GitHub URL parsing, ship helpers, and orchestrator plan/execute/retry. `npm run eval` is the 12-case golden set with field-level assertions on every write.

See [RELIABILITY.md](RELIABILITY.md).
