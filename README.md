# LogicSolver - Solving Logic Grid Puzzles with POS-based parsing and FOP-based analysis
```html
Ross Nordstrom
University of Colorado - Colorado Springs
Masters Project, Dec 2016
Profs. Kalita, Semwal, and Lewis
```

## Abstract
> This paper leverages natural language processing and first order predicate logic
to programmatically solve logic grid puzzles, a constraint-based class of word problems.
Solving logic grid puzzles has two main challenges: parsing natural language clues for
semantic meaning and applying constraints against a model of the puzzle to solve it.
We present *LogicSolver*, a tool advancing existing research in the area by introducing
a more scrutinous evaluation process and automatically solving logic grid puzzles
with minimal puzzle-specific semantics.


### Report
My report, as presented for my MSCS Project, can be found in `LogicSolver.pdf`. 


### Project
The project relies on a simple file-based interface.

Transcribe logic grid puzzles into `.txt` files -- described below -- then use the Parser (`./parser`) and Solver (`./solver`)
to operate on the puzzle(s).

#### Dependencies
This project relies on Node.js, NPM, and Python as its core dependencies.
It's known to work on Ubuntu 15.10 with the following versions:

```sh
$ node -v; npm -v; python --version
v4.4.7
3.10.6
Python 2.7.10
```

#### 1) (By hand) Transcribe a [Logic Grid Puzzle](http://www.logic-puzzles.org/) into a directory
[See examples](./data/puzzles/example)

* `<dir>/clues.txt`       - Paste the clues, separated by newlines
* `<dir>/entities.txt`    - Transcribe the puzzle's entities
  * 1st line is the Entity Types (e.g. dogs, years, owners)
  * <Empty Line>
  * Entity names, in same order as Entity Types, separated by newlines
* `<dir>/answers.txt`     - Record the answers for the puzzle
  * Answers, in same order as Entity Types, separated by newlines
* `<dir>/parseExpected.txt`    - The expected parse for each clue statement

#### 2) Parse the clues
Parse the puzzles into a `parseActual.txt` file.

If you also transcribed a `parseExpected.txt` file,
the program will print an evaluation of the Parser's accuracy.

```sh
cd ./parser

# Install the dependencies defined in `package.json`
npm install

# Setup our Python dependencies (LinkGrammar)
# This will prompt you for `sudo` permissions
npm run setup

# Test it out on the example puzzle from the report
npm start -i ../data/puzzles/example

# Test it on Moderate puzzles
npm run testModerate
```

#### 3) Solve the puzzle
Solve a parsed puzzle (`parseExpected.txt`), printing out the solution as well as the grid-representation of the solution.

```sh
cd ./solver

# Install the dependencies defined in `package.json`
npm install

# Setup the script for use
npm link

# Test it out on the example puzzle from the report, with a more verbose output
npm start -- -i ../data/puzzles/example -q false

# Test it on Moderate puzzles
npm run testModerate
```

