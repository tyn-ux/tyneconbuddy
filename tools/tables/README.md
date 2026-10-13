# Past-paper tables

`tables.json` (repo root) holds the questions whose tables were flattened into one line of text
when the bank was built, rebuilt as text + real tables. `app.html` shows the rebuilt version
only while the question text in the Sheet still matches the text the table was built from
(hash `h`), so an edited question falls back to its own text.

- `tables.spec`: the hand-checked tables, one `@@ KEY` block per question (format at the top of `build.py`).
- `build.py`: `BANK=/path/to/bank.json python3 build.py tables.spec`, then move `tables.json` to the repo root.
  It refuses a table whose digits differ from the flattened text unless the block says `! digits:` why.
