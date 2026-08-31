# Email delivery & rate limits

## The problem

Azure Communication Services caps how fast you can send. The numbers depend on
your sender domain, and Microsoft has changed them more than once — **confirm
the current figures in the ACS resource before go-live** rather than trusting
this table. As of writing, in the right ballpark:

| Sender domain | Per minute | Per hour |
|---|---|---|
| Azure-managed (`*.azurecomm.net`) | ~5 | ~30–100 |
| Verified custom domain | ~30 | ~300–500 |

The app's worst burst is the 08:00 reminder run: roughly one email per active
grower, queued in one go. Before this design those were sent inline, one after
another, as fast as the SDK would take them. Past the limit ACS starts returning
429, and the old sender caught that, marked the row `Failed`, and moved on.

That is not "slow" — **it is silent data loss**. On an Azure-managed domain it
starts at about the sixth grower.

## What the app does now

`NotificationLog` is a real outbox. `notify()` inserts a row and returns;
`lib/email/dispatch.ts` does the sending.

Each pass:

1. **Reclaims** rows a crashed dispatcher left claimed (`Sending`, untouched for
   5 minutes).
2. **Computes the budget** — how many sends the provider will still accept this
   minute and this hour, counted from `lastAttemptAt`. Attempts, not successes:
   a rejected request spends the provider's allowance exactly like an accepted
   one.
3. **Claims a batch atomically** with a single `UPDATE … OUTPUT` under
   `ROWLOCK, UPDLOCK, READPAST`, ordered by `priority` then age. Any number of
   app replicas, cron hits and admin button presses can overlap without sending
   anything twice.
4. **Sends**, recording each outcome.
5. On **429**, requeues honouring `Retry-After`, does *not* spend one of the
   message's retries (being throttled is not that message's fault), and ends the
   pass rather than pushing harder.

Failures retry after 1, 5, 15 and 60 minutes, then stop at 5 attempts with the
reason recorded in `lastError` and shown in the Outbox. Permanent rejections —
a malformed address — fail immediately rather than burning the budget four more
times.

### Priority, and why sign-in links jump the queue

`EMAIL_PRIORITY` in `lib/constants.ts`: auth 1, transactional 3, bulk 7. Lower
goes first.

Priority alone is not enough, though. Sign-in links are sent **inline**, not
queued, because a 15-minute link that leaves the building 20 minutes later is
useless. That means they compete with the dispatcher for the same per-minute
allowance — so `EMAIL_INTERACTIVE_RESERVE` holds back slots the bulk queue will
not spend. With the defaults, reminders drain at 3/min and 2/min stay free for
someone signing in.

### The arithmetic

100 growers, Azure-managed domain, defaults:

- per-minute: 5 − 2 reserved = **3/min** → ~33 minutes to drain.
- per-hour: ~100 → **this is the binding constraint.** 100 growers sits exactly
  at the ceiling; more spills into the next hour. Correctly — via backoff — but
  late.

A verified custom domain turns that into a non-issue.

## The four levers, most leverage first

### 1. Verify a custom domain

Roughly 6× the headroom on both limits, and — the part that matters more —
`@*.azurecomm.net` mail is routinely spam-foldered. For growers receiving
sign-in links, **deliverability is the bigger problem of the two**: a link that
lands in junk is a support call, and a rate limit is only a delay.

This is DNS work on the client's domain (SPF, DKIM, DMARC), not code, and it
gates nothing else here — so start it early and run on the managed domain
meanwhile.

### 2. File a quota-increase request

ACS send limits are soft; they are raised through an Azure support quota
request. It is free and takes days, so file it early rather than discovering the
ceiling on go-live morning.

### 3. Queue, pace, retry

Already built, described above. This is what makes the app **correct under
whatever the limit turns out to be**, which is the point — the numbers are
guesses until someone confirms them.

### 4. Send fewer messages

The only real multiplier was the new-item-request fan-out: one email per admin
per request, so ten admins meant ten sends. It now groups admins by language and
sends one message per distinct language — in practice two. Reminders were
already deduplicated to one per grower per day.

If volume ever becomes a problem again, the next candidate is a daily digest for
admins instead of a message per request. It would need a new template and it
delays admin awareness by up to a day, so it is not worth doing pre-emptively.

## Tuning

No code assumes a particular rate. Raising throughput is these numbers plus a
redeploy — set them in `azure-pipelines.yml` (staging and production share the
`emailRatePerMinute` / `emailRatePerHour` / `emailInteractiveReserve`
variables), or in `.env` locally.

| Variable | Default | Meaning |
|---|---|---|
| `EMAIL_RATE_PER_MINUTE` | 5 | provider's per-minute cap |
| `EMAIL_RATE_PER_HOUR` | 100 | provider's per-hour cap |
| `EMAIL_INTERACTIVE_RESERVE` | 2 | per-minute slots kept free for sign-in links |
| `EMAIL_DISPATCH_BATCH` | 25 | ceiling on one pass's claim |
| `EMAIL_DISPATCH_INTERVAL_MS` | 30000 | in-app drain interval; 0 disables it |

Set the rate variables to what the provider actually allows, not to what you
wish it allowed: they are how the app knows when to stop, and setting them too
high just moves the failure back into ACS.

## Watching it work

- **Outbox** (Settings → Outbox) — filter by status. `Queued` is waiting,
  `Sending` is in flight, `Failed` carries the reason and attempt count.
- **"Send queued email now"** (Settings → Schedulers) — runs one pass and
  reports what happened. Still paced; it is not an override.
- **Container logs** — the loop logs a line for any pass that did something.

To watch the pacing on a laptop with no Azure account: set
`EMAIL_PROVIDER=acs`, leave `ACS_CONNECTION_STRING` unset (outside production
the transport reports success without sending), set `EMAIL_RATE_PER_MINUTE=2`,
then run the reminder check and watch rows move through the Outbox.
