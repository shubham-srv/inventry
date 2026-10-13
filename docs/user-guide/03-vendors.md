# Part 3 — For vendors

How to report the stock you are holding, answer orders with a delivery date, and
keep your item conversions up to date. Read Part 1 first if you have not — in
particular §1.2, which explains what the quantities are counted in.

---

## 3.1 Your dashboard

A summary of what you have reported.

| What you see | What it means |
|---|---|
| **Submit today's report** | No report has been submitted today |
| **Items supplied** | How many items you are mapped to supply |
| **Growers served** | How many growers you supply between them |
| **Latest total qty** | The total across your most recent report |
| **Top items by latest quantity** | Your largest holdings, most recent figures |

If it says *"No reports yet"*, nothing has been submitted against your account.

---

## 3.2 Reporting your stock

On **Submit supply report**, enter the quantity you are holding for each item.

- Only items **mapped to your vendor** are listed. If you see *"No items are
  mapped to your vendor yet"*, your account works but nobody has assigned items
  to it — ask an administrator.
- Quantities are in each item's category, as everywhere else. See §1.2.
- **Load previous values** starts you from your last report so you edit only
  what moved. Reports change little week to week, and this is faster than
  retyping.
- **prev** beside an item shows what you last reported for it.

Leave an item blank if you are not reporting on it. Blank is not zero: **zero
means you hold none of it**.

> **There is no draft.** Unlike the grower count, a supply report is submitted in
> one go. Finish the figures before you start, or submit again afterwards — a
> later report supersedes an earlier one.

### Field reference — the report form

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Quantity** | No | How much of the item you are holding, in its category | Zero or more. Blank = not reported, 0 = none held. |

---

## 3.3 Allocating stock to growers

Optional, and only useful when it is true: against any item you can break the
quantity down by grower — how much of what you hold is **earmarked for whom**.

Select **Allocate to growers** beside an item and enter a quantity per grower.
The running total shows as *"3 / 10 allocated"*.

**What an allocation is.** A statement of intent, so the people planning against
your stock know what is effectively spoken for. It is not a commitment, not an
order, and not a promise of delivery.

**Leaving it blank is fine.** Report the total and nothing else if you do not
split stock by grower, or do not want to say how. Allocations are extra detail,
never a requirement.

> **Allocations cannot exceed the quantity reported.** If they do you will see
> *"Allocated total exceeds the item quantity"*, and the report **will not
> submit** until it is corrected — the message names how many items are
> affected. Either raise the reported quantity or lower an allocation.

### Field reference — allocations

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Grower** | — | Chosen from the growers you supply | Only growers mapped to you appear. |
| **Allocated quantity** | No | How much of this item is earmarked for that grower | Zero or more. The total across growers may not exceed the item quantity. |

---

## 3.4 Your history

**Report history** lists your past reports, most recent first. Open any entry to
see the item quantities and the grower allocations recorded with it.

---

## 3.5 Orders — confirming delivery dates

When a grower orders from you, you are emailed and **Orders** in the menu shows a
count of orders still waiting for your date.

On **Orders**, each open order shows what the grower asked for (**Requested**)
and **Your delivery date**. Choose **Confirm date** to answer, or **Change** to
move it later. The grower is emailed either way, and the office measures on-time
delivery against your date from then on.

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Delivery date** | Yes | The day you will deliver | Not before the order date. The grower's requested date is shown for reference. |

### Minimum lead time

At the top of **Orders**, **Edit lead time** sets the fewest days you need
between an order and its delivery. Growers cannot request delivery sooner than
that. Leave it blank for no minimum.

---

## 3.6 My items and your conversions

**My items** lists everything you supply: your latest reported quantity, how much
of it is allocated, when you last reported it, and the office's notes about the
item. **Export** downloads the same list as an Excel file.

The **Conversions** column shows how you ship each item — for example
*Bags ×10 → Boxes ×5 → Cases*. Use the box icon to change it:

| Field | Required | What to enter | Notes |
|---|---|---|---|
| **Conversion chain** | No | How the item is packed for shipping | Only chains set up for the item's category are offered. Choose *none* to ship in plain units. |
| **Quantities per level** | With a chain | One number per level, innermost first, separated by commas | e.g. `10, 5` = 10 bags per box, 5 boxes per case. Whole numbers of 1 or more. |

Conversions only describe what an order occupies on the way. They never change
how much is ordered or received.
