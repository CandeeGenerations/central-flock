# A Calendar Print Event stores its Repeat Rule; the Year Copy never re-guesses it

The **Year Copy** builds next year's printed calendar from this year's. Each **Event** carries
a **Repeat Rule** ("4th Thursday of November", "Easter − 7", "the Wednesday of Dec 25's week",
"doesn't repeat"). The rule is guessed once, either when the Event is created or by a one-time
backfill. It is shown in plain words on the Event form, corrected there by hand if it's wrong,
and copied forward onto the new Event. The Year Copy only *evaluates* stored rules. It never infers
a rule from a date.

## Why not infer from the date each year

One year's date doesn't determine the rule. Thanksgiving 2026 (Nov 26) is both the 4th and the
last Thursday, and the two rules give different dates in years with five Thursdays. Memorial Day
2026 (May 25) is the 4th and the last Monday; in 2027 it is the last but the *5th*. The Church
Picnic on Sat Jul 4 could be "July 4th" or "the Saturday nearest July 4th". The Lord's Supper on
Tue Mar 31 looks like "5th Tuesday of March" but means "Easter − 5". If the copy inferred rules,
every year would bring back the same wrong guesses for someone to fix again. Storing the rule means
each correction is made once and then holds for later years.

Guessing *is* still needed, but only to propose a first rule. It is deterministic: title match
against a built-in **Anchor** list first, then Nth weekday. It deliberately makes no "it's
near Easter" guesses. The Kids & Youth Extravaganza on Apr 11, 2026 is Easter + 6 by coincidence,
and proximity guessing would anchor it to Easter. Having Claude guess was rejected: there are fewer
than 100 Events, and repeatable output matters more than a cleverer first guess.

## Why this is hard to undo

Once people have corrected rules by hand, those corrections are data. Going back to inferring from
dates would silently throw them away, and the Lord's Supper would be after Easter again in 2027.

## Considered options

- **Infer at copy time, every year.** No new data, but the same ambiguities come back every year.
- **Rules relative to another Event** ("the day before the Thanksgiving Day Event"). Rejected:
  renaming or deleting the anchor Event would break the rule. Anchors are a built-in list of
  computed dates (Easter, Thanksgiving, …) plus fixed month/days.
- **A review screen before the copy writes anything.** Rejected: the copied calendar is reviewed
  in the normal editor, and the Repeats field on the Event form is where a rule gets fixed.
