# Part 1 — How the system works

Five ideas, and the rest of the system follows from them. This part is short and
worth reading once, whatever your role.

---

## 1.1 Items, and why their IDs never change

Everything in the system hangs off an **item** — a specific thing you count,
order and receive. "Corrugated Box 40x30" is an item. So is "Blue Label Roll".

Every item has an ID that looks like this:

    AP-BX-00001
    │  │  │
    │  │  └─ a five-digit number
    │  └──── the material category (BX = Boxes)
    └─────── the commodity (AP = Asparagus)

**An item ID is permanent.** Every count anyone has ever entered, every order and
every delivery points at that ID. Changing it would disconnect an item from its
own history, so the system does not allow it.

You can freely change an item's **name**, and should when the name is wrong. The
name is a label; the ID is the identity.

New items created in the system are given the next number automatically. Numbers
are never reused, and gaps in the sequence are normal and harmless.

---

## 1.2 There is no unit of measure — the category *is* the unit

This is the one idea people find surprising, so it is worth stating plainly.

**An item is counted in its material category.** An item whose category is
*Boxes* is counted in boxes. One whose category is *Rolls* is counted in rolls.
There is no separate "unit" field anywhere in the system, because a second,
separately chosen unit could only ever end up contradicting the category.

So a count of `340` against an item in *Boxes* means **340 boxes** — in the daily
count, in an order, in a vendor's report and in a low-stock threshold alike.
Everything is in the same terms by construction, and nothing needs converting.

> **What this means when naming categories.** Name a category after the thing you
> count. If you count rolls of labels, the category is *Rolls*, not *Labels*.
>
> **Renaming a category later relabels every quantity ever recorded against its
> items — it does not convert them.** If a category named *Boxes* is renamed to
> *Pallets*, a count of 340 boxes taken last year now reads as 340 pallets. The
> numbers do not change; what they claim to mean does. Treat a category rename
> after go-live as a serious change.

---

## 1.3 You only see what applies to you

The system shows each person their own slice, and this is not a display
preference — the data genuinely is not reachable outside it.

- A **grower** sees only the items they have been authorised for, and only their
  own organisation's counts, orders and history. One grower can never see
  another's numbers.
- A **vendor** sees only their own reported stock and history.
- **Staff** see everything, with what they may change depending on their role
  (Part 4).

Two consequences worth knowing in advance:

**"An item is missing from my list."** Almost always it means the item has not
been authorised for that grower, not that something is broken. An administrator
adds the authorisation and it appears. See Part 4.

**Access is not the same as being known to the system.** Being able to sign in
with a work account does not by itself grant access — an administrator must have
created a user record. This is intentional.

---

## 1.4 Saved is not the same as submitted

When a grower records a daily count there are two distinct outcomes:

| | What it means |
|---|---|
| **Draft** | Saved so you can come back to it. **Does not count.** Nobody is notified, stock figures do not move, and the day still counts as not submitted. |
| **Submitted** | The count is recorded. Stock figures update, history is written, and the people who need to know are notified. |

A draft is for an interrupted count — start in the morning, finish after lunch.
It is not a lighter way of submitting.

> **About the word "Approved".** Once submitted, a count is shown as
> **Approved**. Nobody approves it; there is no review step and no queue waiting
> on anyone. It simply means the count was submitted and is being counted. If you
> are looking for who approved something, the answer is that nothing did.

---

## 1.5 The everyday cycle

Most of the system is one loop, repeated:

1. **A grower counts.** Daily, or on whatever rhythm has been set for them.
2. **Low stock is noticed**, in one of two independent ways:
   - the grower **ticks an item as low** while counting, which raises a flag for
     staff to look at; or
   - the counted quantity **falls below the threshold** set for that item, which
     makes it appear on a running shortage list. This happens on its own — no
     flag is raised and nobody has to tick anything.

   Thresholds are set per item, and can be overridden for an individual grower
   where one site should be treated differently.
3. **Staff review** the flags and the shortage list, and respond.
4. **A grower orders** from one of the vendors mapped to that item. Several open
   orders for the same item are allowed.
5. **The delivery arrives** and the grower marks it received — recording a
   shortfall, damage or over-delivery if what arrived did not match.
6. **Vendors report** the stock they are holding, and optionally how much of it
   is earmarked for which grower.

Two side channels run alongside it:

- **Missing-item requests.** If a grower needs to count something that does not
  exist in the system yet, they ask for it rather than improvising against a
  similar item. Staff add it, or explain why not.
- **Item messages.** Staff attach a short notice to an item — *Retiring*,
  *Increase stock*, *Clear inventory* or a general *Notice* — and the growers it
  is aimed at see it while counting. Messages can be scheduled to appear and
  expire on set dates.

---

## 1.6 A note on packaging

Vendors may have packaging described against the items they supply — how many
bags to a box, boxes to a case, cases to a pallet.

**This is descriptive only.** It tells you what a quantity occupies: order 343
bags and the system can tell you that is roughly 35 boxes. It never changes the
quantity ordered, received or counted. If you order 343, 343 is what is ordered
and 343 is what is expected.
