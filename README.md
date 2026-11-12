# Crowder Quiz Show

A family study game. The website (this repo, hosted on GitHub Pages) plays the quiz.
Questions and answers live in the **Quiz Show** Google Sheet in macrowder@gmail.com's Drive.

## How it fits together

- **Questions tab**: one row per question. Types: `mc`, `tf`, `short`, `match` (rows with the same Group form one matching set). Set Active to `No` to retire a question. Short answers accept alternates separated by `|`.
- **Results tab**: the game adds one row per answer.
- **Settings tab**: family code, players, round size, read-aloud default.
- **apps-script/Code.gs**: the small script, pasted into the sheet (Extensions > Apps Script), that hands questions to the game and saves answers.
- **config.js**: holds the Apps Script web app address.

## Keys

`1`-`4` or `A`-`D` answer multiple choice, `T`/`F` true or false, `Enter` locks in a typed answer or moves on, `M` music on/off.
Matching: `1`-`5` picks a description, `A`-`E` picks a term.
