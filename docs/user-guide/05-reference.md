# Part 5 — Reference

Lookup material for everyone.

---

## 5.1 Glossary

**Allocation** — a vendor's statement of how much of the stock they hold is
earmarked for a particular grower. Informational; not an order or a commitment.

**Authorisation** — permission for a grower to count a particular item. A grower
sees only the items authorised for them.

**Cadence** — how often a grower is reminded to submit: daily, weekly, monthly,
or after a set number of days without a count.

**Commodity** — the crop or product family an item belongs to. Supplies the
first two letters of the item ID.

**Draft** — a saved but unsubmitted count. Does not count towards anything.

**Flag** — a mark a grower puts on an item during counting to ask staff to look
at it. Distinct from being below threshold, which happens automatically.

**Item** — a specific thing that is counted, ordered and received. The unit of
everything in the system.

**Item ID** — the permanent identifier of an item, in the form `CC-MM-NNNNNN`.
Never changes.

**Item message** — a short notice staff attach to an item, shown to growers
while they count.

**Location** — a physical site. Counts are recorded against one, and a site's
type governs whether growers, vendors or both may use it.

**Mapping** — the link recording which growers may count an item and which
vendors supply it.

**Material category** — the packaging material family an item belongs to.
Supplies the second two letters of the item ID, **and is the unit the item is
counted in**. There is no separate unit of measure anywhere in the system.

**Outbox** — the record of every email the system has produced and what became
of it.

**Submission** — a grower's recorded count for a location on a day. Shown as
*Approved* once submitted, although nothing approves it.

**Sub-category** — a finer split within a material category.

**Supply report** — a vendor's statement of the quantity they are holding per
item, optionally broken down by grower.

**Threshold** — the quantity below which an item counts as short. Set per item,
optionally overridden for one grower.

---

## 5.2 Statuses

### Items, growers and vendors

| Status | Meaning |
|---|---|
| **Active** | In use |
| **Inactive** | Withdrawn from use; all history kept |
| **Pending** | Set up but not yet operating (growers) |
| **Review** | Being reconsidered; still usable (items) |

### Submissions

| Status | Meaning |
|---|---|
| **Draft** | Saved, not submitted. Counts towards nothing |
| **Approved** | Submitted and recorded |

> Submitted counts read as **Approved**, but nothing approves them — there is no
> review step and nothing waits on anyone. *Pending* and *Rejected* may appear in
> the underlying list of values; neither is used for counts.

### Orders

| Status | Meaning |
|---|---|
| **Open** | Placed, not yet arrived |
| **Received** | Arrived and confirmed, with any mismatch recorded |
| **Cancelled** | Closed without arriving. Cannot be undone |

### Item requests

| Status | Meaning |
|---|---|
| **Open** | Not yet looked at |
| **Reviewed** | Staff responded; see the note |
| **Fulfilled** | The item now exists |
| **Rejected** | It will not be added; the note explains why |

### Emails, in the outbox

| Status | Meaning |
|---|---|
| **Queued** | Waiting to be sent. Normal |
| **Sending** | Being sent now |
| **Sent** | Accepted by the mail provider |
| **Failed** | Gave up or was permanently rejected |
| **Mocked** | Recorded but deliberately not sent — sending is switched off |

---

## 5.3 What the system sends by email

| Email | Goes to | Sent when |
|---|---|---|
| **Sign-in link** | The person signing in | They request one. Valid 15 minutes, once |
| **Submission received** | The grower's primary email | A grower submits a count |
| **Supply report received** | The vendor's contact email | A vendor submits a report |
| **Scheduled reminder** | The grower's primary email | Their cadence says a count is due |
| **Missing item request** | All administrators | A grower requests an item |
| **Request reviewed** | The grower's primary email | Staff record an outcome, with their note |
| **Low inventory reviewed** | The grower's primary email | Staff review a flag, with their note |
| **Order placed** | The vendor's contact email | A grower places an order |

Organisation emails go to the address on the grower or vendor record, in the
language set on that record. An organisation with no email address on file
receives none of them, silently.

---

## 5.4 When something looks wrong

### I cannot sign in

**"That account does not have access to this app"** — your sign-in worked; you
have no user record. Ask an administrator to add you (§4.7).

**Nothing about my account is recognised** — for internal staff, the email on
your user record must be the same address as your Microsoft account. An
administrator can check.

**The link in my email does not work** — links last 15 minutes and work once.
Requesting a new one cancels the previous, so always use the most recent email.
Request another.

**No email arrives** — check the spelling, then your spam folder. If neither, an
administrator can confirm the address on file and check the outbox (§4.12) to
see whether it was sent at all.

### An item is missing from my list

Almost always the item is not authorised for you, rather than absent from the
system. Ask an administrator to check the authorisation (§4.6). If the item
genuinely does not exist, request it (§2.6).

### I submitted but it still says not submitted

You probably saved a **draft**. A draft keeps your numbers but counts towards
nothing, and the banner reads *"Draft saved — not submitted yet"*. Open it and
select **Submit counts** (§1.4).

### I cannot submit at all

If the message mentions locations, no site is mapped to your grower and an
administrator must map one (§4.5). If it mentions items, none are authorised for
you yet.

### A quantity looks wrong, or is in the wrong units

Every quantity is in the item's **material category** — an item in *Boxes* is in
boxes everywhere (§1.2). If a figure reads in the wrong terms, the usual cause is
that the category was renamed at some point: renaming relabels history without
converting it. An administrator can confirm from the audit log (§4.11).

### A grower did not get their reminder

Check, in order: the grower has a primary email on file; their schedule is
enabled; the cadence is what you expect; and the outbox for a Failed row
(§4.12).

### An email never arrived

The outbox (§4.12) is the answer. **Sent** means the provider accepted it — look
at spam and at the address on file. **Failed** records the reason. **Queued** is
normal and means it is about to go. Many failures at once is a system problem;
contact your delivery team.

### A message on an item disappeared

Item messages can be scheduled to expire. Its end date passed. Nothing is wrong,
and growers are not told why it went (§4.2.4).

---

## 5.5 Where to find more

This guide covers **using** the system. How it is built, hosted, secured and
backed up is in the technical documentation held by your delivery team.

For anything not answered here, contact your usual administrator. It saves time
if you can say which screen you were on, what you were trying to do, and the
exact wording of any message you saw.
