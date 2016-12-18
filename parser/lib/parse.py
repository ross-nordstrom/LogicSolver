#!/usr/bin/env python
import os
import re
import sys
import codecs
import argparse
import itertools
from pylinkgrammar.linkgrammar import Parser, ParseOptions

PARSE_VIA_REGEX = True

# Make sure utf8 chars don't break consumers (e.g. if consuming via a pipe from Node)
sys.stdout = codecs.getwriter('utf8')(sys.stdout)

argparser = argparse.ArgumentParser(description="Analyze statements for a Logic Puzzle game")
argparser.add_argument('-v', '--verbose', action="store_true", help='whether or not to print verbose logs')
argparser.add_argument('-q', '--quiet', action="store_true", help='whether or not to trim out unnecessary logs')
argparser.add_argument('-d', '--directory', action="store_true", help='whether or not the "-i" input is a directory of puzzle directories')
argparser.add_argument('-i', '--input', nargs="+", type=str,
                       help="an input directory containing the files \"entities.txt\", \"clues.txt\", and \"answers.txt\"\n\n"
                            + "Entitites file:  an input file containing information about the Entity Types and specific Entities in use. Structure should be \"Type1,Type2,...\n\nEntity1a,Entity1b,...\nEntity2a,...\"\n"
                            + "Clues files: an input file containing statements for a logic puzzle. Each statement should be on a separate line (e.g separated by newline)")


def main(inputDir, verbose=False, quiet=False):
    # Inputs
    entitiesFile = '/'.join([inputDir, 'entities.txt'])
    statementsFile = '/'.join([inputDir, 'clues.txt'])
    expectedParseFile = '/'.join([inputDir, 'parseExpected.txt'])
    actualParseFile = '/'.join([inputDir, 'parseActual.txt'])

    # ERROR!
    if not statementsFile:
        argparser.print_help()
        return sys.exit()

    # Read in the file inputs
    statements = readStatements(statementsFile)
    entitiesByType = readEntities(entitiesFile)
    try:
        expectedParses = readStatements(expectedParseFile)
    except:
        expectedParses = None

    # Link-grammar parser
    p = Parser(max_null_count=2, verbosity=0)
    print ""  # Whitespace after the Parser's printing
    print promptColors()['BLUE'] + inputDir + promptColors()['COLOR_NONE']

    # Book keeping as we parse all the statements
    total, success, fail = [0, 0, 0]
    actuals = []
    i = 0

    # Parse each clue statement
    for s in statements:
        expected = expectedParses[i] if expectedParses else None
        i = i + 1
        if not s:
            continue

        entities, comparison, quantifier = [None, None, None]
        try:
            entities, comparison, quantifier = parseSentence(i, p, s, entitiesByType)

        # NAIVE PARSE FAILURE
        # Try NER parse...
        except (LinkageError, ParseError) as e:
            if verbose:
                print "Problem parsing unadulterated sentence: {0}".format(e)
                print 'Attempting NER-replacement to help the parser do better...'

            try:
                replacedEntitiesByType, replacedSentence = replaceEntities(entitiesByType, s)
                i_orig = i
                i = str(i) + ' [NER]'
                replacedEntities, comparison, quantifier = parseSentence(i, p, replacedSentence, replacedEntitiesByType)
                entities = unreplaceEntities(replacedEntities, replacedEntitiesByType, entitiesByType)
            except (LinkageError, ParseError) as eNer:
                if verbose:
                    print "Problem parsing NER-replaced sentence: {0}".format(eNer)
            i = i_orig

        # PARSE FAILURE
        if not entities:
            if expected:
                print promptColors()['PURPLE'] + "   " + expected + "\t (Expected)"
            fail += 1

        # PARSE SUCCESS
        else:
            try:
                prettyParsed = ', '.join(entities) + ((', ' + ' '.join(quantifier)) if quantifier else '')
            except (TypeError) as e:
                print "   Entities: {0}, Quantifier: {1}".format(entities, quantifier)
                prettyParsed = "{0}Problem formatting parse: {1}{2}".format(promptColors()['RED'], e, promptColors()['COLOR_NONE'])
            actual = comparison + "(" + prettyParsed + ")"
            actuals.append(actual)

            if verbose:
                print ""

            # Correct parse
            if not expected or actual == expected:
                if not expectedParses:
                    print "   " + actual + " (Actual)"
                elif not quiet:
                    print promptColors()['LIGHT_GREEN'] + (u"\u2713" if expected else " ") + promptColors()['COLOR_NONE'] \
                          + "  " + actual + promptColors()['COLOR_NONE']
                success += 1

            # Incorrect parse
            else:
                print promptColors()['YELLOW'] + u"\u0078" + promptColors()[
                    'COLOR_NONE'] + "  " + actual + "\t (Actual)"
                if expected:
                    print promptColors()['YELLOW'] + "   " + expected + "\t (Expected)" \
                          + promptColors()['COLOR_NONE']
                fail += 1

            if verbose:
                print ""

        total += 1
        #
        # DONE PARSING *THIS* STATEMENT
        ################################

    #
    # DONE PARSING *ALL* STATEMENTS
    ################################

    writeActual(actualParseFile, actuals)

    return [total, success, fail]


# ************************************************************************************
def parseSentence(i, p, s, entitiesByType):
    #
    # PARSE THE STATEMENT
    #
    print promptColors()['LIGHT_GRAY'] + str(i) + ". " + s + promptColors()['COLOR_NONE']
    l = p.parse_sent(s)

    # PARSE FAILURE
    if len(l) < 1:
        raise LinkageError('No linkages found in link-grammar parser')

    # PARSE SUCCESS
    outFile = 'out/linkage_' + str(i) + '.ps'

    #
    # LINKAGE PARSE
    #

    # Choose the best linkage from the parse
    best = [None, None, None]
    for linkage in l:
        entities, comparison, quantifier = parseLinkage(linkage, s, entitiesByType, outFile, verbose)
        if entities and ((entities[0] and 'xor' in entities[1]) or (comparison and quantifier)):
            best = [entities, comparison, quantifier]
            break
        elif entities and comparison:
            if not best[0]:
                best = [entities, comparison, quantifier]
    entities, comparison, quantifier = best

    if not entities:

        # Try to default so we don't totally fail to parse the sentence
        entities = parseAllEntities(entitiesByType, s, verbose)
        comparison, quantifier = parseComparisons([], None, entitiesByType, verbose)  # Get default comparison ("is")
        if (len(entities) >= 2):
            return [entities, comparison, quantifier]

        print promptColors()['LIGHT_RED'] + u"\u0078" \
              + "  Failed to parse any linkages (tried " + str(len(l)) + ")!" \
              + promptColors()['COLOR_NONE']
        raise ParseError('No viable entity/comparison/quantifier parses found')

    return entities, comparison, quantifier


# ************************************************************************************
def parseLinkage(linkage, sentence, entitiesByType, outFile, verbose=False):
    if verbose:
        if outFile:
            open(outFile, 'w').write(linkage.postscript)
        print linkage.constituent_phrases_nested
        print linkage.diagram

        print "\nParsing linkage's constituent phrases..."

    partsOfStatement = linkage.constituent_phrases_flat
    return parseConstituentParts(entitiesByType, partsOfStatement, sentence, verbose)


# ************************************************************************************
def replaceEntities(entitiesByType, sentence):
    # TODO
    replacedEntitiesByType = dict(entitiesByType)
    replacedSentence = str(sentence)

    if 'ages' not in replacedEntitiesByType:
        return replacedEntitiesByType, sentence

    replacedEntitiesByType['ages'] = ['Entity1', 'Entity2', 'Entity3', 'Entity4']
    replacedSentence = replacedSentence.replace(entitiesByType['ages'][0], 'Entity1')
    replacedSentence = replacedSentence.replace(entitiesByType['ages'][1], 'Entity2')
    replacedSentence = replacedSentence.replace(entitiesByType['ages'][2], 'Entity3')
    replacedSentence = replacedSentence.replace(entitiesByType['ages'][3], 'Entity4')
    return replacedEntitiesByType, replacedSentence


# ************************************************************************************
def unreplaceEntities(replacedEntities, replacedEntitiesByType, entitiesByType):
    entities = []
    for entity in replacedEntities:
        for category in replacedEntitiesByType:
            replacedEntities = replacedEntitiesByType[category]
            if entity in replacedEntities:
                # Un-replace the entity string
                entities.append(entitiesByType[category][replacedEntities.index(entity)])

    return entities


# ************************************************************************************
def parseFirstEntity(entitiesByType, words, verbose=False):
    allEntities = parseAllEntities(entitiesByType, words, verbose)

    # Hm.. this shouldn't happen
    if len(allEntities) < 1:
        if verbose:
            print promptColors()['RED'] + "Didn't find any entities, but expected to find 1" + promptColors()[
                'COLOR_NONE']
        return None

    # Ah! This wasn't expected!
    if verbose and len(allEntities) > 1:
        print promptColors()['RED'] + "Found multiple entities, but only expected 1: " + ', '.join(allEntities) + \
              promptColors()['COLOR_NONE']

    return allEntities[0]


# ************************************************************************************
def getAllEntities(entitiesByType, verbose=False):
    allEntities = list(itertools.chain.from_iterable(entitiesByType.values()))
    allEntities.sort(key=len, reverse=True)  # sorts by descending length
    return [entity.strip() for entity in allEntities]


# ************************************************************************************
def parseAllEntities(entitiesByType, words, verbose=False):
    allEntities = getAllEntities(entitiesByType)

    sentence = ' '.join(words).lower()

    # Some entities (like 'sailboat' get parsed into 2 words 'sail boat',
    #   so this is a hack to detect those as well
    sentenceNoSpace = noSpace(sentence)

    # Pseudo Named Entity Recognition
    # Are any of the provided words a known Entity?
    # NOTE: Logic is done from the known entity perspective so that it will work on multi-word entities
    entities = [entity for entity in allEntities if (entity.lower() in sentence or noSpace(entity) in sentenceNoSpace)]

    # Sort by the order they appeared in the sentence
    entities.sort(key=lambda entity: (sentence.index(entity.lower()) if entity.lower() in sentence
                                      else (sentenceNoSpace.index(noSpace(entity)) if noSpace(entity) in sentenceNoSpace
                                            else None)))

    # Ensure we don't mistakenly get extra entities in the case where some entity names exist in other
    # E.g. "12 silver" would naively be parsed as ["12 silver", "2 silver"]
    for entity in entities:
        otherEntities = list(entities)
        otherEntities.remove(entity)
        # If this entity is a subsctring of another entity, remove it!
        if bool([e for e in otherEntities if entity in e]):
            entities.remove(entity)

    return entities


# ************************************************************************************
def noSpace(x):
    return ''.join(x.lower().split())


# ************************************************************************************
def readStatements(statementsFile):
    return [statement for statement in readFile(statementsFile).split("\n") if statement]


# ************************************************************************************
def readEntities(entitiesFile):
    content = readFile(entitiesFile)

    x = content.split("\n\n")
    types = x[0].split(", ")
    entitiesByType = {}

    i = 0
    for entities in x[1].split("\n"):
        if not entities:
            continue
        entityType = types[i]
        if entityType:
            entitiesByType[entityType] = entities.split(', ')
        i += 1

    return entitiesByType


# ************************************************************************************
def writeActual(actualFile, actuals):
    return writeFile(actualFile, '\n'.join(actuals))


# ************************************************************************************
def readFile(file):
    input_file = open(file)
    return input_file.read()


# ************************************************************************************
def writeFile(file, contents):
    input_file = open(file, 'w')
    return input_file.write(contents + '\n')


# ************************************************************************************
def invertEntityMap(entitiesByType):
    inverted = {}
    for entityType, entities in entitiesByType.items():
        for entity in entities:
            inverted[entity] = entityType

    return inverted


def getWordsByPosIdxLUT(parts):
    charIdx = 0
    index = {}

    for node in parts:
        index[charIdx] = node.words
        # Add 1 because the POS tags are separated by spaces
        charIdx = charIdx + len(node.type) + 1

    return index


# lut       - a wordsByPosIdx lookup table
# idxRange  - a start (inclusive) and end (exclusive) POS idx
# returns the words found in the POS Idx range
def getWordsByPosIdx(lut, posIdxRange):
    words = [v for k, v in lut.iteritems() if posIdxRange[0] <= k < posIdxRange[1]]
    return flatten(words)


def parseConstituentParts(entitiesByType, parts, sentence, verbose=False):
    ENTITY_PHRASE = r"((NP )?(NP )?((VP )?PP )?)?NP"
    X = ENTITY_PHRASE.count('(')
    ENTITY_PHRASE_SIMPLE = r"(NP )?NP"
    Y = ENTITY_PHRASE_SIMPLE.count('(')
    ENTITY_PHRASE_PASSIVE = r"(NP )?NP SBAR WHNP S (VP (PP )?(NP )?NP)"
    Z = ENTITY_PHRASE_PASSIVE.count('(')

    CMP_ADVP = r"^S (" + ENTITY_PHRASE + ").* (VP (NP )?(ADVP )(PP)) (" + ENTITY_PHRASE + ")$"
    CMP_VPVPVP = r"^S (" + ENTITY_PHRASE + ").* VP (VP )+(NP )?(PP )(" + ENTITY_PHRASE + ")$"
    CMP_ADJP = r"^S (" + ENTITY_PHRASE + ").* (VP (NP )?(ADJP )PP) (" + ENTITY_PHRASE + ")$"
    CMP_PP = r"^S (" + ENTITY_PHRASE + ") (VP (NP )?(PP )(NP )?)(" + ENTITY_PHRASE + ")$"
    CMP_NP = r"^S (" + ENTITY_PHRASE + ").* (PP )?(NP )PP (" + ENTITY_PHRASE + ")$"
    CMP_VP = r"^S (" + ENTITY_PHRASE + ").* (VP )(" + ENTITY_PHRASE + ")$"
    # TODO: Convert CMP_WHNP_VP to use ENTITY_PHRASE_PASSIVE
    CMP_WHNP_VP = r"^S .* SBAR WHNP S (VP (PP )?)?(" + ENTITY_PHRASE_SIMPLE + ") (VP )(" + ENTITY_PHRASE_SIMPLE + ")"
    CMP_WHNP_PP = r"^S .*?(" + ENTITY_PHRASE_PASSIVE + ") (VP (NP )?(PP )?NP) (PP )?(" + ENTITY_PHRASE + ")$"
    CMP_WHNP_ADJP_WHNP = r"^S .*?(" + ENTITY_PHRASE_PASSIVE + ") (VP (NP )?(PP )?NP) (ADJP ADVP (PP )?)(" + ENTITY_PHRASE_PASSIVE + "$)"
    CMP_ADJP_ADVP = r"^S (" + ENTITY_PHRASE + ").* PP (NP )?(ADJP )?(ADVP )PP (" + ENTITY_PHRASE + ")$"
    EQUALITY_VP = r"^S .*?(" + ENTITY_PHRASE + ") (VP )?VP (" + ENTITY_PHRASE + ")$"

    #
    # Regexes for identifying Entities, Comparisons, and Quantifiers ordered by priority
    # These should be sorted by order of preference. First match found is used.
    #
    # NOTE: 'entities' values are **both** used
    #       'comparison' values are only used for the first match
    #       'quantifier' values are only used for the first match
    #
    # TODO: Use official English tenses (https://www.ego4u.com/en/cram-up/grammar/tenses)
    #       Include examples of each tense
    PHRASE_MATCHERS = [
        {'name': 'Future (ADVP)', 'reg': CMP_ADVP, 'entities': [1, X + 6], 'comparison': [X + 5], 'quantifier': [X + 4, X + 3]},
        {'name': 'Future (VPVPVP)', 'reg': CMP_VPVPVP, 'entities': [1, X + 5], 'comparison': [X + 4], 'quantifier': [X + 3]},
        {'name': 'Simple (NP)', 'reg': CMP_NP, 'entities': [1, X + 4], 'comparison': [X + 3], 'quantifier': [X + 3]},
        {'name': 'Present (ADJP)', 'reg': CMP_ADJP, 'entities': [1, X + 5], 'comparison': [X + 4], 'quantifier': [X + 3, X + 2]},
        {'name': 'Present (PP)', 'reg': CMP_PP, 'entities': [1, X + 6], 'comparison': [X + 4], 'quantifier': [X + 3, X + 5]},
        {'name': 'Simple (VP)', 'reg': CMP_VP, 'entities': [1, X + 3], 'comparison': [X + 2], 'quantifier': []},
        {'name': 'Past Passive (WHNP_VP)', 'reg': CMP_WHNP_VP, 'entities': [3, Y + 5], 'comparison': [Y + 4], 'quantifier': []},
        {'name': 'Past Passive (WHNP_PP)', 'reg': CMP_WHNP_PP, 'entities': [1, Z + 6], 'comparison': [Z + 2], 'quantifier': []},
        {'name': 'Past Passive (WHNP_ADJP)', 'reg': CMP_WHNP_ADJP_WHNP, 'entities': [1, Z + 7], 'comparison': [Z + 5],
         'quantifier': [Z + 5]},
    ]

    # Get the Types of the parts as a single string so we can check the pattern with a Regex
    # Should look like 'S NP VP PP NP NP'
    posParts = [p.type for p in parts]
    posStr = ' '.join(posParts)

    if verbose:
        print "POS: " + posStr
        print parts

    # Knowing how many entities are in the sentence helps us make some top-level decisions
    allWords = [part.words for part in parts]
    allEntities = parseAllEntities(entitiesByType, flatten(allWords), verbose)

    #
    # Special case for really long sentences
    #
    isEitherOr = ("either" in sentence) and ("or" in sentence)
    isDoubleEitherOr = ('Of' in sentence) and (len(allEntities) == 4)
    isBigNot = (not isEitherOr) and (len(allEntities) > 2)

    # Statements saying one of X and Y are W and Z
    # E.g. "Of the Irish Pride and the 28 ft vessel, one is owned by Ernesto Ellis and the other is owned by Betsy Becker."
    # => is(xor(Irish Pride, 28 ft), xor(Ernesto Ellis, Betsy Becker))
    if isDoubleEitherOr:
        entities = [None, None]
        eitherParts = [' '.join(allEntities[0:2]), ' '.join(allEntities[2:4])]
        entities[0] = parseEitherEntities(entitiesByType, eitherParts[0], verbose)
        entities[1] = parseEitherEntities(entitiesByType, eitherParts[1], verbose)
        comparison, quantifier = parseComparisons([], None, entitiesByType, verbose)  # Get default comparison ("is")
        return [entities, comparison, quantifier]

    # Statements saying X is (either Y or Z). This is effectively an XOR
    # E.g. "The vacation with Dustin is either the 2004 holiday or the hang gliding holiday"
    # => before(Greg, maroon, 2 minutes)
    elif isEitherOr:
        entities = [None, None]
        eitherParts = sentence.split('either')
        entities[0] = parseEitherEntities(entitiesByType, eitherParts[0], verbose)
        entities[1] = parseEitherEntities(entitiesByType, eitherParts[1], verbose)
        comparison, quantifier = parseComparisons([], None, entitiesByType, verbose)  # Get default comparison ("is")
        return [entities, comparison, quantifier]

    # Statements like
    # "The five projects are the study on the Orion, Beulah's study, Henrietta's assignment,
    #   the project beginning in July and the assignment beginning in March."
    # This means all of the listed entities are mutually exclusive
    elif isBigNot:
        entities = allEntities
        comparison = "not"
        quantifier = None
        return [entities, comparison, quantifier]

    #
    # Try to generically parse the Entities/Comparisons/Quantifier based on regex results
    #
    wordLUT = getWordsByPosIdxLUT(parts)

    candidates = []
    for matcher in PHRASE_MATCHERS:
        match = re.match(matcher['reg'], posStr)
        if bool(match):
            try:
                results = parseViaRegex(match, entitiesByType, wordLUT, matcher['entities'], matcher['comparison'], matcher['quantifier'])
                candidates = addResultCandidate(candidates, results)
            except:
                if verbose:
                    print 'No valid matches found despite regex match for ' + matcher['name']

    return candidates[0] if len(candidates) > 0 else [None, None, None]


# ************************************************************************************
def addResultCandidate(candidates, results):
    candidates.append(results)
    return sorted(candidates, cmp=compareResults)


# ************************************************************************************
# -1 => result1 is a better match
# +1 => result2 is a better match
#  0 => equally-good matches
def compareResults(result1, result2):
    # A) Prefer comparisons of equalities
    if ('is' in result1 and 'is' not in result2):
        return +1
    if ('is' not in result1 and 'is' in result2):
        return -1

    size1 = len([x for x in result1 if x])
    size2 = len([x for x in result2 if x])

    # B) Prefer more detailed results
    if size1 > size2:
        return -1
    if size1 < size2:
        return +1
    else:
        return 0


# ************************************************************************************
def parseViaRegex(match, entitiesByType, wordLUT, entitiesIdx, comparisonsIdx, quantifiersIdx):
    entities = [getWordsByPosIdx(wordLUT, match.regs[idx]) for idx in entitiesIdx]
    # Named Entity Recognition: Filter down to known entities
    entities = [' '.join(parseAllEntities(entitiesByType, entity, verbose)) for entity in entities]
    entities = [entity for entity in entities if entity]
    assert (len(entities) == len(entitiesIdx)), 'Unable to find expected number of entities'

    comparisons = [getWordsByPosIdx(wordLUT, match.regs[idx]) for idx in comparisonsIdx]
    comparisons = [comp for comp in comparisons if comp][0]

    quantifiers = [getWordsByPosIdx(wordLUT, match.regs[idx]) for idx in quantifiersIdx]
    quantifiers = [mod for mod in quantifiers if mod]
    if quantifiers:
        # Naively remove the comparison from the quantifier. This is NOT robust.
        quantifier = [word for word in quantifiers[0] if word not in comparisons]

        # Remove abstract comparisons (e.g. 'somewhat', 'sometime', etc...)
        quantifier = [word for word in quantifier if 'some' not in word]
    else:
        quantifier = None

    [comparison, quantifier] = parseComparisons(comparisons, quantifier, entitiesByType, verbose)
    return [entities, comparison, quantifier]


# ************************************************************************************
def flatten(list):
    return [val for sublist in list for val in sublist]


# ************************************************************************************
def parseComparisons(comparisons, quantifier, entitiesByType, verbose=False):
    KNOWN_COMPARATORS = set([
        'after', 'before',
        'more', 'less',
        'more', 'fewer',
        'larger', 'smaller',
        'taller', 'shorter',
        'higher', 'lower',
        'older', 'younger',
        'ahead', 'behind',
        'farther', 'closer',
        'further', 'nearer',
        'longer', 'shorter'
    ])

    matches = list(KNOWN_COMPARATORS & set(comparisons))
    if len(matches) > 0:
        # Default the quantifier in case it ended up within the comparison instead of the quantifier
        quantifier = quantifier if quantifier else [word for word in comparisons if word not in matches]

        if quantifier:
            types = [type.lower() for type in entitiesByType]
            value, type = [None, None]

            # Try to find a value and a type
            for item in quantifier:
                try:
                    int(item)
                    value = item if not value else value
                except:
                    candidates = [t for t in types if item.strip().lower() in t.lower()]
                    type = item if candidates else type

            # Prefer our strictly parsed value/type if we found any
            quantifier = [value, type] if value and type else ([value] if value else [])

        return [matches[0], quantifier]

    # Unknown comparison. Defaulting to "is", meaning it's an equality, not comparison
    return ["is", None]


# ************************************************************************************
def parseEitherEntities(entitiesByType, words, verbose=False):
    entities = parseAllEntities(entitiesByType, words, verbose)
    if len(entities) == 1:
        return entities[0]
    elif len(entities) > 1:
        return "xor(" + ', '.join(entities) + ")"

    return None


# ************************************************************************************
class LinkageError(Exception):
    pass


# ************************************************************************************
class ParseError(Exception):
    pass


# ************************************************************************************
def promptColors():
    colors = {}
    colors['RED'] = "\033[0;31m"
    colors['LIGHT_RED'] = "\033[1;31m"
    colors['YELLOW'] = "\033[1;33m"
    colors['GREEN'] = "\033[0;32m"
    colors['LIGHT_GREEN'] = "\033[1;32m"
    colors['BLUE'] = "\033[1;94m"
    colors['LIGHT_BLUE'] = "\033[1;36m"
    colors['PURPLE'] = "\033[1;34m"
    colors['WHITE'] = "\033[1;37m"
    colors['LIGHT_GRAY'] = "\033[0;37m"
    colors['COLOR_NONE'] = "\033[0m"
    return colors


# ************************************************************************************
# see: http://stackoverflow.com/a/800201/1624707
def get_immediate_subdirectories(a_dir):
    return [(a_dir + '/' + name) for name in os.listdir(a_dir) if os.path.isdir(os.path.join(a_dir, name))]


# ************************************************************************************
if __name__ == "__main__":

    if len(sys.argv) <= 1:
        argparser.print_help()
        sys.exit()

    args = argparser.parse_args()
    verbose = args.verbose
    quiet = args.quiet
    inputDirs = args.input
    nestedDirs = args.directory

    total, success, fail = [0, 0, 0]

    if nestedDirs:
        inputDirs = get_immediate_subdirectories(inputDirs[0])
        inputDirs.sort()
        print "NESTED DIRS:"
        print inputDirs

    for inputDir in inputDirs:
        total_i, success_i, fail_i = main(inputDir, verbose, quiet)
        total += total_i
        success += success_i
        fail += fail_i

    print ""
    print ""

    if (success / float(total)) < 0.70:
        print promptColors()['RED'] + '## FAILURE'
    elif (success / float(total)) < 0.90:
        print promptColors()['YELLOW'] + '## DECENT'
    else:
        print promptColors()['GREEN'] + '## SUCCESS'

    print promptColors()['WHITE'] + str(100 * success / total) + "% success -  " \
          + str(success) + " of " + str(total) + " total statements"
    print ""
