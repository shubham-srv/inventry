# Part 4 — Administration

For the people who set the system up and keep it running.

Much of what follows changes what other people see and can do. Where an action
is hard to undo, this part says so at the point you would take it, rather than
assuming you already know.

---

## 4.1 Roles — who can do what

Five roles. A person has exactly one.

| Role | What it is for |
|---|---|
| **SuperAdmin** | Full access, including settings |
| **InternalAdmin** | Full access, including settings |
| **Editor** | Master data only — no partners, users, settings or reports |
| **GrowerUser** | A grower's own screens only (Part 2) |
| **VendorUser** | A vendor's own screens only (Part 3) |

| Area | SuperAdmin | InternalAdmin | Editor |
|---|---|---|---|
| Items, commodities, categories, sub-categories, countries, locations | Yes | Yes | **Yes** |
| Packaging | Yes | Yes | **Yes** |
| Growers, vendors, authorisations | Yes | Yes | No |
| Users | Yes | Yes | No |
| Thresholds, schedules, audit log, outbox | Yes | Yes | No |
| Reports and export | Yes | Yes | No |

> **SuperAdmin and InternalAdmin currently grant the same access.** The
> distinction is organisational — a way of recording who is the system owner
> rather than a difference in what the system permits. Do not rely on it as a
> security boundary.

**Editor is the useful middle.** Someone who maintains the item catalogue but
should not see reports, change who can access what, or reach settings. Reports
are deliberately excluded from Editor.

Growers and vendors hold no administrative access of any kind. Their entire
world is the screens in Parts 2 and 3.

---

## 4.2 Your daily queues

Three entries near the top of the menu carry a count.

**Colour tells you whether it needs you.** A coloured badge means someone is
waiting. A grey badge is a count for information — it is normal for it never to
reach zero, and it does not need clearing.

### 4.2.1 Low inventory — Flags

Items a grower has explicitly ticked as low. **Coloured badge — these are
waiting on you.**

Open one, read the count and the grower, and record your review with a note. The
grower is emailed the outcome, note included, so it is worth writing something
they can act on.

Reviewing a flag does not change any stock figure. It records that a human
looked and responded.

### 4.2.2 Low inventory — Current

Everything currently below its threshold, computed live from the latest counts.

This is **not a queue**. There is nothing to clear, no state stored, and nothing
waiting on anyone. Items appear and disappear on their own as counts change. Use
it as a shortage list to plan around.

> **Flags and Current are different things and answer different questions.**
> Flags is *"who asked for attention"*. Current is *"what is actually short"*.
> An item can be on one, both or neither. A grower flagging something does not
> put it on the shortage list, and falling below threshold does not raise a flag.

### 4.2.3 Item requests

Growers asking for items that do not exist yet. **Coloured badge.**

Move each to an outcome:

| Set it to | When | What the grower sees |
|---|---|---|
| **Reviewed** | You have looked and responded, but it is not resolved | Your note |
| **Fulfilled** | You created the item and authorised them for it | Your note; the item appears in their list |
| **Rejected** | It will not be added | Your note explaining why |

The note is emailed to the grower. A rejection without a reason will simply come
back as the same request next week.

> **Fulfilled does not create anything.** Creating the item (§4.3) and
> authorising the grower for it (§4.6) are separate steps you take yourself.
> Marking a request Fulfilled only records the outcome — if you skip those steps,
> the grower is told the item exists and still cannot see it.

### 4.2.4 Item messages

Notices attached to an item that the relevant growers see while counting. **Grey
badge** — it counts what is currently live, and is not a to-do list.

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Item** | Yes | The item the notice is about | |
| **Kind** | Yes | Retiring / Increase stock / Clear inventory / Notice | Sets how it reads to the grower — see the table in §2.7 |
| **Message** | Yes | The notice itself | Keep it to a sentence or two; it is read on a phone, mid-count |
| **Spanish message** | No | The Spanish wording | **Leave blank and it is translated automatically.** Type one in and yours is used as written |
| **Audience** | Yes | All growers, or a chosen few | |
| **Growers** | Only when the audience is a chosen few | Which growers see it | |
| **Starts / Ends** | No | The window to show it in | Blank start = immediately; blank end = until you deactivate it |
| **Active** | Yes | Whether it shows at all | Turn off rather than deleting when you may want it back |

A message that has passed its end date stops appearing. That is the mechanism
working, not a fault — growers will not be told why it went.

---

## 4.3 Items

The centre of the system. Everything else exists to describe items or to record
quantities of them.

### Creating an item

The **ID is generated** — you do not choose it. It is built from the commodity
and category you pick plus the next number in sequence, and the form previews it
as you fill it in. Once saved it is permanent (§1.1).

### Field reference — item

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Item ID** | — | Generated on create; shown but not editable when editing | Permanent. Every count and order points at it |
| **Name** | Yes | What people call the thing | Change this freely — it is a label, not the identity |
| **Photo** | No | A picture of the item | Helps people counting recognise it. Large photos are resized automatically. Growers and vendors can see it |
| **Commodity** | Yes | The crop or product family | Forms the first part of the ID. **Cannot be changed after creation** |
| **Category** | Yes | The material category | Forms the second part of the ID, **and is the unit everything is counted in** (§1.2) |
| **Sub-category** | Yes | The finer split within the category | Only sub-categories belonging to the chosen category are offered |
| **Country of origin** | Yes | Where it comes from | |
| **Application** | No | Machine / Hand / Machine/Hand / N/A | |
| **Status** | Yes | Active / Inactive / Review | *Review* marks an item you are still deciding about |
| **Growers** | No | Who may count this item | The same as authorising from the mappings screen (§4.6) |
| **Vendors** | No | Who supplies it | A grower can only order from a vendor listed here |
| **Notes** | No | Anything useful about the item | |

### Deactivate rather than delete

Setting the status to **Inactive** takes an item out of circulation while
keeping every count, order and ledger entry that refers to it.

**Deleting is different.** The system refuses to delete an item that is
referenced by existing records, and tells you to deactivate it instead. Where a
delete does succeed, it is because nothing refers to the item — but its photo is
deleted with it, and this cannot be undone.

As a rule: **delete only mistakes, and only on the day you make them.**
Everything else is deactivation.

---

## 4.4 Master data

The lookups that items are built from. Small screens, but changing them reaches
a long way.

| Screen | What it holds | Consequence of changing it |
|---|---|---|
| **Commodities** | Crop/product families, with a short code | The code is the first part of every item ID built from it. Existing IDs never change, so a renamed code leaves old IDs reading the old letters |
| **Categories** | Material categories, with a short code | The second part of the ID — **and the unit every quantity is counted in**. See the warning below |
| **Sub-categories** | The finer split within a category | Moving one between categories will contradict the IDs of items already using it |
| **Countries** | Origins and locations | A country marked as not selectable stays valid as an item origin but disappears from the location and vendor pickers |
| **Locations** | Physical sites | A site's type gates who can use it — some are grower-only, some vendor-only, some either |

> **Renaming a category relabels history; it does not convert it.** A count of
> 340 taken when the category was *Boxes* still reads 340 after a rename to
> *Pallets* — it now simply claims to be 340 pallets. Nothing recalculates,
> because nothing can: the system has no conversion between the two and never
> recorded which was meant. Treat a category rename after go-live as a change to
> the meaning of every number ever recorded against its items.

**Codes** are two-letter and uppercase by convention, and are entered as
uppercase whatever you type.

---

## 4.5 Growers and vendors

The organisations on the other side of the system.

### Field reference — grower

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Name** | Yes | The organisation's name | Must be unique |
| **Primary email** | No | Where confirmations and reminders go | Without it, this grower receives no notifications at all |
| **Status** | Yes | Active / Inactive / Pending | |
| **Language** | Yes | English or Spanish | The language of emails to the address above. Separate from the language each person chooses for themselves |
| **Items** | No | Which items they may count | Same as authorising in §4.6 |
| **Locations** | No | Which sites they count at | **A grower with no location cannot submit anything at all** |

> **A grower with no location is stuck.** They can sign in, see their items and
> get reminders, but the submit screen will refuse them. It is the first thing to
> check when a new grower reports they cannot start.

### Field reference — vendor

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Name** | Yes | The organisation's name | Must be unique |
| **Type** | No | Manufacturer / Pallet Pooling / 3PL / Distributor | |
| **Headquarters country** | No | Where the vendor is based | Not the same as where it ships from |
| **Locations** | No | The sites it operates from | |
| **Primary contact / Email / Phone** | No | Who to reach | |
| **Lead time (days)** | No | Whole days from order to delivery | Informational |
| **Payment terms (days)** | No | The number from "Net N days" | The number only |
| **Account number** | No | Your account reference with them | |
| **Status** | Yes | Active / Inactive | |
| **Language** | Yes | English or Spanish | Language of emails to this vendor |

---

## 4.6 Who may do what — mappings

Two separate questions, both editable from the mappings screen or from the item
itself — they are the same data seen from different ends.

**Which growers may count which items.** A grower sees *only* the items
authorised for them. Add one and it appears in their next count; remove one and
it disappears. Past counts are untouched — removing an authorisation is not
retrospective and never deletes history.

**Which vendors supply which items.** This is what populates the vendor list
when a grower places an order. A grower cannot order an item from a vendor that
is not mapped to it, and will see *"No vendors mapped to this item"*.

> When a grower reports a missing item, check the authorisation before assuming
> the item does not exist. The two look identical from their side.

---

## 4.7 Users

Who can sign in, and as what.

### Field reference — user

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **First name / Last name** | Yes | Their name | |
| **Email** | Yes | Their email address | Must be unique. **For internal staff this must be the address they sign in to Microsoft with** |
| **Role** | Yes | One of the five roles (§4.1) | |
| **Active** | Yes | Whether they may sign in | |
| **Grower** | Only for GrowerUser | Which grower they belong to | Must be blank for every other role |
| **Vendor** | Only for VendorUser | Which vendor they belong to | Must be blank for every other role |

**The email is the identity.** No passwords are stored. Internal staff sign in
with Microsoft, growers and vendors with an emailed link — either way, the
address on this record is what they must use. An internal user whose address
here does not match their Microsoft account cannot get in.

**A person belongs to exactly one organisation.** A GrowerUser is tied to one
grower, a VendorUser to one vendor. Someone who genuinely works for two needs two
accounts with different email addresses.

> **Turning off Active removes access immediately.** Their next action returns
> them to the sign-in screen even if they are signed in at the time. Use it when
> someone leaves — it is instant and reversible, unlike deleting, and it keeps
> their name attached to everything they recorded.

A person's own display and sign-in-email language is not set here — each person
chooses it themselves with the language control (see the introduction).

---

## 4.8 Thresholds

The quantity below which an item counts as short.

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Item** | Yes | The item | |
| **Grower** | No | Leave blank for a threshold that applies to everyone | Set a grower to override the general figure for that one |
| **Threshold quantity** | Yes | The level, in the item's category | Zero or more. **There is no unit to choose** — it comes from the category, so a threshold can never be recorded in different terms from the counts it is compared against |

**A grower-specific threshold always wins** over the general one for that grower.
Everyone else continues to use the general figure. This is how you handle a site
that legitimately holds far more or less than the others.

**What a threshold does:** puts an item on the *Current* shortage list (§4.2.2)
when a count falls below it, and marks it **Below threshold** on the grower's
screen while they type.

**What it does not do:** raise a flag, send an email, or block a submission.

---

## 4.9 Reminder schedules

How often growers are prompted to submit.

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Scope** | Yes | Global, or a single grower | Global is the default everyone follows |
| **Grower** | Only when the scope is a grower | Which grower this overrides for | |
| **Cadence** | Yes | Daily / Weekly / Monthly / After N days | *After N days* prompts only when they have not submitted for that long |
| **Days** | Yes | The number of days for *After N days* | Between 1 and 90 |
| **Enabled** | Yes | Whether it runs | Turn off to pause reminders without losing the setting |

A grower-specific schedule replaces the global one for that grower.

There is a button to **run the check immediately** rather than waiting for the
next scheduled run — useful for confirming a change does what you expected.
Running it sends real emails to real people, so use it deliberately.

Reminders go to the grower's **primary email** (§4.5). A grower without one is
silently never reminded.

---

## 4.10 Reports and export

Available to administrators, not Editors.

Grower stock, orders and vendor stock, each filterable.

**Export to Excel** produces exactly what is on screen — the same rows, in the
same order, with your filters applied. If an export looks wrong, check the
filters before anything else. Every export is recorded in the audit log, with
the filters used.

---

## 4.11 Audit log

Every create, update, delete and export: who, what, when, and the values before
and after.

This is where you answer *"who changed this, and when?"* — the item that changed
status, the threshold that moved, the user who was deactivated.

It is a record, not a recycle bin. It tells you what a value used to be so you
can put it back yourself; it has no undo.

---

## 4.12 Outbox — did that email send?

Every message the system has produced, and what became of it.

| Status | What it means | What to do |
|---|---|---|
| **Queued** | Waiting to be sent | Nothing. It will go shortly |
| **Sending** | Being sent right now | Nothing |
| **Sent** | Handed to the mail provider successfully | Nothing. If the recipient still has nothing, it is a spam-folder or wrong-address question |
| **Failed** | Gave up, or was permanently rejected | Open it. The reason and the number of attempts are recorded |
| **Mocked** | Recorded but deliberately not sent | Expected in a test environment; it means sending is switched off, not broken |

You can preview any message exactly as it was sent, which settles most "what did
they actually receive?" questions.

> **Messages queue on purpose.** They are paced to stay within what the mail
> provider allows, so a batch of reminders drains over a few minutes rather than
> being rejected in bulk. Queued is a healthy state; it is not a backlog.

A single **Failed** row is usually a bad address. Many at once is a system-level
problem — contact your delivery team rather than retrying by hand.
