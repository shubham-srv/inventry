# Part 2 — For growers

Everything you need in order to record counts, order stock and receive
deliveries. If you have not read Part 1, read it first — it is short, and it
explains why quantities work the way they do.

---

## 2.1 Your dashboard

The first screen after signing in. It answers one question: *what still needs
doing today?*

| What you see | What it means |
|---|---|
| **Submit today's count** | Today's count has not been submitted. Selecting this takes you straight to the form. |
| **Today's progress** | How many of your items have been submitted today, out of the total you are authorised for. |
| **Continue submission** | A draft exists. Your work is saved but **has not been submitted**. |
| **Low-inventory flags** | Items you have marked as low that staff have not yet reviewed. |
| **Open requests** | Items you have asked for that have not been resolved. |
| **Biggest changes vs last week** | The items that moved most since the same day last week. A large unexpected movement is usually worth a second look before you submit. |

If it says *"Not enough history yet"*, the system does not yet have a week of
counts to compare against. It fills in on its own.

---

## 2.2 Recording your daily count

The main task, on **Submit inventory**.

### Before you start: choose a location

Counts are recorded **against a location**, so set it first. If you count at more
than one site, submit them separately — one count per site.

> If you see *"No locations are mapped to your grower yet"*, you cannot submit at
> all until an administrator maps at least one site to you. This is the most
> common reason a new grower cannot get started.

### Entering the counts

Your authorised items are listed with a box for each. Enter what you have **on
hand right now**, in the item's category — see §1.2. An item in *Boxes* is
counted in boxes.

Useful things on this screen:

- **Load previous values** fills the form with your last submitted numbers so
  you edit only what moved. Most counts change little day to day, and this is
  both faster and less error-prone than retyping every box.
- **prev** beside an item shows what you last submitted for it.
- **min** shows the threshold set for that item. A count below it is marked
  **Below threshold** as you type.
- **Search and sort** at the top of the list — by ID, by name or by quantity —
  which beats scrolling on a long list.

Leave an item blank if you did not count it. A blank is not the same as zero:
**zero means you have none**, blank means you did not look.

### Field reference — the count form

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Location** | Yes | The site you are counting at | Only sites mapped to you appear. Submitting is blocked without one. |
| **On hand** | No | The quantity you hold, in the item's category | Zero or more; decimals allowed. Blank = not counted, 0 = none held. |
| **Low** | No | Tick if stock is low and someone should look | Raises a flag for staff — see §2.3. |

### Saving versus submitting

| Button | What happens |
|---|---|
| **Save draft** | Your numbers are kept. **Nothing counts.** Stock figures do not move, nobody is notified, and the day still shows as not submitted. The banner reads *"Draft saved — not submitted yet"*. |
| **Submit counts** | The count is recorded, stock figures update, history is written and the relevant people are notified. |

You are told how many items were submitted. Afterwards the count shows as
**Approved** — nobody approves it and nothing is waiting on anyone. See §1.4.

You can submit again the same day if you got something wrong. The later
submission is the one that stands.

> If you see *"No items are authorized for your grower yet"*, your account works
> but no items have been assigned to you. Ask an administrator.

---

## 2.3 Flagging an item as low

Tick **Low** beside an item while counting. This raises a flag that staff see in
their review queue, separately from the number you entered.

Use it when a count needs a human to look — stock is running out faster than
usual, or something is wrong that the number alone does not convey.

You do not have to flag something merely because it is below its threshold. Items
below threshold already appear on a shortage list that staff watch, automatically
and without anyone ticking anything. The tick is for when you want to say
*"please look at this one"*.

When staff review your flag they can add a note, and you are emailed the outcome.
You can also clear your own flag if the situation resolves before anyone looks.

---

## 2.4 Ordering from a vendor

From the submission screen, open the **Orders** section against an item and
select **Add order**.

- Only vendors **mapped to that item** appear. If it says *"No vendors mapped to
  this item"*, ask an administrator to map one — you cannot order until they do.
- The quantity is in the item's category, like everything else.
- You may have **several open orders for the same item** at once. That is normal
  and supported.

### Field reference — new order

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Vendor** | Yes | Who you are ordering from | Only vendors mapped to this item are offered. |
| **Quantity** | Yes | How much to order, in the item's category | Must be greater than zero. |
| **Expected delivery date** | No | When you expect it | Can be set now or added later, and changed any time with **Edit expected delivery date**. |

The vendor is notified when you place the order.

---

## 2.5 Receiving a delivery

When stock arrives, find the order and select **Receive**.

The quantity is **prefilled with what you ordered**, because the common case is
that it matches. *Change it only if something is off.*

If what arrived does not match what was ordered, say why:

| Reason | Use it when |
|---|---|
| **Short shipped** | Less arrived than was ordered |
| **Damaged** | Some or all of it is unusable |
| **Over shipped** | More arrived than was ordered |

The reason is **ignored when the quantity matches**, so there is nothing to pick
in the normal case.

This matters more than it looks. A recorded mismatch is the only trace that a
delivery went wrong, and it is what anyone reviewing a vendor's reliability later
will be looking at.

### Field reference — confirm receipt

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Quantity received** | Yes | What actually arrived | Prefilled from the order, in the item's category. |
| **Reason** | Only if the quantity differs | Short shipped / Damaged / Over shipped | Ignored when the quantity matches what was ordered. |

### Cancelling

**Cancel order** closes an order that will not arrive. It does not count as
received and does not affect stock. Cancelling cannot be undone — raise a new
order instead.

Orders you close today stay on screen for the rest of the day so you can see what
you have done, then drop off the list.

---

## 2.6 Asking for an item that does not exist

If you need to count something that is not in your list, **ask for it** — do not
record it against a similar item. A count against the wrong item is worse than a
missing count, because it looks correct.

Go to **Missing item requests** and select **New request**.

### Field reference — new item request

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Item name** | Yes | What the thing is called, as specifically as you can | e.g. *Asparagus Banding Rubber 9in*. A vague name slows the request down. |
| **Commodity** | No | The crop or product family it belongs to | A hint for staff. |
| **Category** | No | What it would be counted in — boxes, rolls, bags | A hint for staff. |
| **Notes** | No | Anything else useful | Who supplies it, how it is used, how urgently you need it. |

Your request goes to staff and moves through these states:

| Status | What it means |
|---|---|
| **Open** | Not looked at yet |
| **Reviewed** | Staff have seen it and responded — read their note |
| **Fulfilled** | The item now exists and should be in your list |
| **Rejected** | It will not be added; the note explains why |

You are emailed when the outcome is recorded, and the note comes with it.

---

## 2.7 Messages on an item

Staff can attach a short notice to an item, which you see while counting. There
are four kinds:

| Kind | What it is asking of you |
|---|---|
| **Retiring** | This item is being phased out — expect it to disappear |
| **Increase stock** | Hold more of this than usual |
| **Clear inventory** | Run this down; do not reorder |
| **Notice** | General information, no action implied |

Messages appear in your own language, and can be set to start and stop on given
dates — so a message disappearing is normal and does not mean anything is wrong.

---

## 2.8 Your history

**Submission history** lists everything you have submitted, most recent first.
Open any entry to see the individual item counts, who submitted it and when.

Drafts are not here. A draft has not been submitted, so it is not history yet.

---

## 2.9 Reminders

The system emails you a reminder to submit, on a rhythm your administrator sets —
daily, weekly, monthly, or after a set number of days without a count.

Reminders go to the address held against your grower record, in the language set
on that record. To change either, or to change how often they arrive, ask your
administrator.

If reminders are not arriving at all, see §5.4.
