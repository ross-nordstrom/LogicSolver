# LogicSolver - Dataset
Files describing logic grid puzzles, including their input state as well as parsing outputs.

#### File definitions:
* `<dir>/clues.txt`       - Paste the clues, separated by newlines
* `<dir>/entities.txt`    - Transcribe the puzzle's entities
  * 1st line is the Entity Types (e.g. dogs, years, owners)
  * <Empty Line>
  * Entity names, in same order as Entity Types, separated by newlines
* `<dir>/answers.txt`     - Record the answers for the puzzle
  * Answers, in same order as Entity Types, separated by newlines
* `<dir>/parseExpected.txt`    - The expected parse for each clue statement

