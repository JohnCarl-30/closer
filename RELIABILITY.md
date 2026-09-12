# Reliability

Closer closes one loop: merged GitHub PR → Linear Done + comment → Gmail to the requester. Success is GET after PUT, not the model's word.

## Gate

`overall = min(match, email)`. Writes only if the PR is merged and overall ≥ 0.75. Escalation is a passing outcome. Two tickets that both fit pause on `needs_choice` and write nothing until a human picks one. Missing recipients and unmerged PRs still escalate with zero writes.

## Verify

After Linear `issueUpdate` / `commentCreate` and Gmail `messages.send`, a verifier agent re-reads issue state, comments, and `in:sent`. The writer never scores its own send 200. A send that returns 200 with no sent message is `failed` with `missing: ["gmail"]`.

Every write is attempted even if an earlier one throws, so a run always reaches the verifier with an
accurate record of what landed. `retryMissing` then re-attempts exactly the entries in `missing` —
Linear state, Linear comment, or Gmail — and re-verifies.

## Golden set

`npm test` covers the gate, retries, URL parsing, and orchestrator helpers. `npm run eval` is the 13-case golden set.

```
case                     result   status
01-happy-branch          pass    done
02-happy-identifier      pass    done
03-ambiguous             pass    needs_choice
04-no-issue              pass    escalated
05-email-low             pass    escalated
06-silent-200            pass    failed
07-linear-429            pass    done
08-partial-gmail-fail    pass    failed
09-not-merged            pass    escalated
10-already-done          pass    done
11-linear-state-fails    pass    failed
12-email-mismatch        pass    escalated
13-linear-comment-fails  pass    failed

13/13 passed
```

Traces: `eval/traces/<id>.json`.

## Known holes

- Google Calendar is not wired. The loop is GitHub + Linear + Gmail only.
- Live Gmail needs a refresh token in `.dev.vars`. Without it, the UI mocks send and still runs verify.
- Linear 429 retry is three attempts with a short backoff. Not a full rate-limit budget.
