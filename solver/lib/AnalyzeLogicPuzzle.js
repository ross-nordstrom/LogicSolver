/**
 * @namespace Analyze
 * @memberof LogicPuzzle
 * @summary ...
 * @since 12/12/15
 * @author Ross Nordstrom <nordstrom.ross@gmail.com>
 */

"use strict";

var _ = require('underscore');
var Table = require('cli-table');
var colors = require('colors');
var jsdiff = require('diff');

var Entity = require('./Entity');

var CELL_SOLVED = ' ✔ '.bgBlue;
var CELL_SOLVED_RIGHT = ' ✔ '.bgGreen;
var CELL_SOLVED_WRONG = ' ✔ '.bgRed + '(✗)';
var CELL_POSSIBLE = '   ';
var CELL_IMPOSSIBLE = ' ✗ ';
var CELL_IMPOSSIBLE_RIGHT = ' ✗ ';
var CELL_IMPOSSIBLE_WRONG = ' ✗ '.bgRed + '(✔)';

var constraints = {
    is: is,
    not: not,
    before: lesserCompare,
    less: lesserCompare,
    smaller: lesserCompare,
    lower: lesserCompare,
    fewer: lesserCompare,
    short: lesserCompare,
    closer: lesserCompare,
    shorter: lesserCompare,
    younger: lesserCompare,
    earlier: lesserCompare,
    behind: lesserCompare,
    shallower: lesserCompare,
    xor: xor
};
var complements = {
    after: 'before',
    more: ['less', 'fewer'],
    larger: 'smaller',
    higher: 'lower',
    taller: 'shorter',
    longer: 'shorter',
    far: 'short',
    farther: 'closer',
    further: 'closer',
    older: 'younger',
    later: 'earlier',
    ahead: 'behind',
    deeper: 'shallower'
};

var cmpDates = ['age', 'month', 'date', 'time', 'year'];
var cmpContexts = {
    taller: ['height', 'distance'],
    higher: ['height', 'distance'],

    farther: ['distance'],
    further: ['distance'],

    older: cmpDates,
    after: cmpDates,
    later: cmpDates,

    deeper: ['depth', 'feet', 'meter', 'mile'],

    longer: ['distance', 'day', 'week', 'month', 'year', 'length'],
};
_.each(complements, function (comps, key) {
    if (!cmpContexts[key]) return;

    comps = _.isArray(comps) ? comps : [comps];

    _.each(comps, function (comp) {
        cmpContexts[comp] = (cmpContexts[comp] || []).concat(cmpContexts[key]);
    });
});

/***********************************************************************************************************************
 * Main functions
 **/

/**
 * Analyze a Logic Grid Puzzle given domain knowledge (entities) and clues parsed as First-Order-Predicate statements
 * @param {object} entityInfo         - Object of Entity Types as keys, each with an array of Entities under it
 * @param {string[]} statements     - Array of First-Order-Predicate statements.
 * @param answers
 * @param num
 * @param quiet
 */
function analyze(entityInfo, statements, answers, num, quiet) {
    var space = generateProblemSpace(entityInfo, quiet);

    statements = parseStatements(statements);

    _.each(_.range(0, num), function iterateOverGrid() {
        _.each(statements, _.partial(applyStatement, space)/*(statement)*/);
        applyGridConstraints(space);
    });

    if (!quiet) {
        console.log(statements);
        printGrids(space, answers);
    }
    return printSolution(space, answers, quiet);
}

/***********************************************************************************************************************
 * Internal helper functions (mainly for testing and pseudo-private use)
 **/

/**
 * Given information about our entities, produce a problem space
 * representing all the entities and their relationships
 * @TODO Refactor all space-related functions into their own Namespace, like Entity???
 * @param {object} entityInfo
 * @return {{entities, contexts}} The problem space.
 */
function generateProblemSpace(entityInfo, quiet) {
    var entitiesByType = _.mapObject(entityInfo, function constructEntities(entities, entityType) {
        return _.map(entities, _.partial(Entity.setup, quiet, entityType)/*(entityName)*/);
    });
    var types = _.invoke(_.keys(entitiesByType), 'trim');

    var entities = _.flatten(_.map(entitiesByType, function constructRelationships(entities, entityType) {
        var otherEntities = _.flatten(_.values(_.omit(entitiesByType, entityType)));
        return _.invoke(entities, 'pushRelationships', otherEntities);
    }));
    entitiesByType = _.groupBy(entities, 'type');


    // Generate all possible constraining functions as a map of <constraintName> -> <constrainingFn>
    var constrainingFunctions = _.reduce(constraints,
        function bindCmpToEmptyContext(accConstraintFns, constraintFn, key) {

            // Assume there's only one Entity Type which is the target of comparison
            var context = {
                allEntities: _.clone(entities),
                entitiesByType: _.clone(entitiesByType),
                types: types,
                typeCandidates: _.clone(types)
            };

            if (cmpContexts[key]) {
                var typeCandidates = _.filter(types, function (type) {
                    return _.some(cmpContexts[key], function (cmpContext) {
                        return (type.indexOf(cmpContext) >= 0);
                    });
                });
                if (_.size(typeCandidates) === 1) setContext(context, _.first(typeCandidates));
            }

            // Bind the constraining function to a context
            accConstraintFns[key] = _.partial(constraintFn, context)/*(entities)*/;
            return accConstraintFns;
        },
        /*initial accConstraintFns: */{}
    );
    _.each(complements, function bindComplements(targetKeys, complementKey) {
        targetKeys = _.isArray(targetKeys) ? targetKeys : [targetKeys];

        // If this constraining function has a complement, bind it **to the same context**
        //   For example, we want before() and after() to share a context.
        _.each(targetKeys, function bindComplement(targetKey) {
            constrainingFunctions[complementKey] = complement(constrainingFunctions[targetKey])/*(entities)*/;
        });
    });

    return {
        types: types,
        entities: entities,
        constraints: constrainingFunctions
    };
}

/**
 * Print the grids for each pair of Entity Types
 * @param space
 */
function printGrids(space, answers) {
    var typePairs = _.flatten(_.first(space.types, _.size(space.types) - 1).map(function producePairs(type, idx) {
        var otherTypes = _.rest(space.types, idx + 1);
        return _.map(otherTypes, function producePair(otherType) {
            return [type, otherType];
        });
    }), /*shallow:*/true);

    _.each(typePairs, _.partial(printGrid, space, _, answers)/*(typePair)*/);
}

/**
 * Print the solution grid for a pair of Entity Types
 * @param space
 * @param typePair
 */
function printGrid(space, typePair, answers) {
    var primaryEntities = _.where(space.entities, {type: typePair[0]});
    var secondaryEntities = _.where(space.entities, {type: typePair[1]});

    var table = new Table({
        head: [''].concat(_.pluck(primaryEntities, 'name'))
    });

    // For each row, figure out how to mark cells using simplistic set theory
    //   [ ✔ ] Solution
    //   [   ] Possible
    //   [ ✗ ] Impossible
    _.each(secondaryEntities, function printRow(secondaryEntity) {
        var rowRelationships = secondaryEntity.relationships[typePair[0]];
        var numRelationships = _.size(rowRelationships);

        //if (numRelationships === 0) throw new Error('No possible solution for row. This should NEVER happen.', typePair, secondaryEntity);

        var cells = (numRelationships === 1)
            ? getSolvedRow(primaryEntities, rowRelationships)
            : getInProgressRow(primaryEntities, rowRelationships);

        var cellStrs = _.map(cells, function evaluateCell(val, idx) {
            if (_.isNull(val)) return CELL_POSSIBLE;

            return val
                ? cellSolved(primaryEntities[idx], secondaryEntity, answers)
                : cellImpossible(primaryEntities[idx], secondaryEntity, answers);
        });

        var tableRow = {};
        tableRow[secondaryEntity.name] = cellStrs;
        table.push(tableRow);
    });

    console.log(table.toString());
}

/**
 * Anything in the knownEntities set is the solution (it should only ever be size = 1)
 * @param {Entity[]} allEntities
 * @param {Entity[]} knownEntities
 * @return {boolean[]} Whether each cell is a match or not (e.g. [ ✔ ] vs [ ✗ ])
 */
function getSolvedRow(allEntities, knownEntities) {
    return _.map(allEntities, function getSolvedCell(entity) {
        return _.contains(knownEntities, entity);
    });
}

/**
 * Anything in the knownEntities set is a **candidate** for the solution (it should only ever be size > 1)
 * @param {Entity[]} allEntities
 * @param {Entity[]} knownEntities
 * @return {boolean[]} Whether each cell is a unkown or not-a-match (e.g. [   ] vs [ ✗ ])
 */
function getInProgressRow(allEntities, knownEntities) {
    return _.map(allEntities, function getSolvedCell(entity) {
        if (_.contains(knownEntities, entity)) return null;
        return false;
    });
}

function cellSolved(a, b, answers) {
    if (!answers) return CELL_SOLVED;
    return _.some(answers, _.partial(hasAandB, a, b)/*(answer)*/) ? CELL_SOLVED_RIGHT : CELL_SOLVED_WRONG;
}

function cellImpossible(a, b, answers) {
    if (!answers) return CELL_IMPOSSIBLE;
    return _.some(answers, _.partial(hasAandB, a, b)/*(answer)*/) ? CELL_IMPOSSIBLE_WRONG : CELL_IMPOSSIBLE_RIGHT;
}

function hasAandB(a, b, answer) {
    answer = ' ' + answer;
    return (answer.indexOf(' ' + a.name) >= 0 && answer.indexOf(' ' + b.name) >= 0);
}

/**
 * Print a simple set-based representation of the current solution
 * @param space
 */
function printSolution(space, expected, quiet) {
    var primaryEntities = _.where(space.entities, {type: _.first(space.types)});
    var actual = _.map(primaryEntities, getRelationships).sort().join('\n');
    var results = {success: false, total: _.size(actual.split('\n'))};

    if (!expected) {
        console.log(actual);
        return results;
    }

    results.correct = _.chain(actual.split('\n'))
        .filter(function (act, idx) {
            return (act === expected[idx]);
        })
        .size()
        .value();

    expected = expected.join('\n');

    var diff = jsdiff.diffWords(actual, expected);
    var diffStr = _.map(diff, interpretDiff).join('');
    diffStr = '   ' + diffStr.split('\n').join('\n   ');
    results.success = (actual === expected);
    results.diff = diffStr;

    actual = actual.split('\n');
    expected = expected.split('\n');
    results.out = parseActual(actual, expected);

    return results;
}

function parseActual(actual, expected) {
    return actual
        .map(function (actualRow, idx) {
            var expectedRow = expected[idx];
            if (actualRow === expectedRow) return '   ' + actualRow + '\n';

            var acts = actualRow.split(', ');
            var exps = expectedRow.split(', ');

            var actStr = '   (Actual) ' + acts
                    .map(function (act) {
                        return (exps.indexOf(act) >= 0) ? act : ('[' + act + ']').red;
                    })
                    .join(', ');
            var expStr = '   (Expect) ' + expectedRow + '\n';
            return [actStr, expStr].join('\n');
        })
        .join('\n');
}

function interpretDiff(part) {
    return part.added ? part.value.green
        : (part.removed ? part.value.red : part.value);
}

/**
 * Print a simple representation of an Entity's relationships
 * @param entity
 */
function getRelationships(entity) {
    var prettyRelationships = _.map(entity.relationships, function makePretty(relatedEntities, type) {
        return _.pluck(relatedEntities, 'name').join(', ');
    });
    return [entity.name].concat(prettyRelationships).join(', ');
}

/**
 * Get an Entity by name
 * @param {{entities:Entity[],context:object}} space  - List of Entities
 * @param {string} name     - Entity name
 * @return {Entity|string} Entity
 */
function getEntity(space, name) {
    return _.findWhere(space.entities, {name: name.trim()}) || name;
}

/**
 * Enforce grid-implicit constraints
 * @param space
 */
function applyGridConstraints(space) {
    applyTransitiveEqualities(space);
    applyDisjointInequalities(space);
}

/**
 * Apply transitive properties of equality
 *   1) If A=B and B=C, then A=C
 *   2) If A=B and A!=C, then B!=C (NOT IMPLEMENTED YET)
 *   3) ...?...
 * @param space
 */
function applyTransitiveEqualities(space) {
    // For any solved relationships, propagate Positive/Negative knowledge
    _.each(space.types, function applyConstraintsToTypePair(type, idx) {
        var mainEntities = _.where(space.entities, {type: type});
        var otherTypes = _.without(space.types, type);

        _.each(mainEntities, function applyConstraintsToEntity(mainEntity) {
            _.each(otherTypes, function propagateConstraints(otherType) {
                var otherEntities = mainEntity.relationships[otherType];

                if (_.size(otherEntities) === 1) {
                    space.constraints.is(mainEntity, otherEntities[0]);
                }
            });
        });
    });
}

/**
 * Apply disjoint relationship knowledge.
 *   In other words, is entity A and B and **disjoint** possible relationships in another type,
 *   then **they cannot be equal**
 * @param space
 */
function applyDisjointInequalities(space) {
    // For each pair of entities, if they have mutually-disjoint relationships in a type,
    //   then they **cannot be related.**
    _.each(space.entities, function applyConstraintsToEntityPairs(entity) {
        var otherEntities = _.flatten(_.values(entity.relationships));

        _.each(otherEntities, function applyConstraintsToEntityPair(otherEntity) {
            // Figure out which of their relationships we can check
            var otherTypes = _.without(space.types, entity.type, otherEntity.type);
            if (_.some(otherTypes, _.partial(haveDisjointRelationships, entity, otherEntity)/*(type)*/)) {
                entity.popRelationships(otherEntity);
            }
        });
    });
}

/**
 * Do a pair of entities lack shared relationships in a given type?
 * @param {Entity} entityA
 * @param {Entity} entityB
 * @param {string} type
 * @return {boolean} They have disjoint relationships in the given type
 */
function haveDisjointRelationships(entityA, entityB, type) {
    return _.isEmpty(_.intersection(entityA.relationships[type], entityB.relationships[type]));
}

/**
 * Parse a First-order-predicate statement and evaluate its meaing
 * @param space
 * @param {string} statement    - An FOP statement, such as "is(Massey, October 8)" or "before(bowling pin, Keller)"
 * @return {*} Implicit return by modifying the contents of `space`
 */
function applyStatement(space, statement) {
    var fnName = statement.split('(')[0];
    var args = statement.split('(')[1].split(')')[0].split(', ');
    var cmpArgs = _.map(args, _.partial(getEntity, space)/*(name)*/);

    // Invoke the appropriate constraining function (e.g. is(), before(), after(), etc...)
    var cmp = space.constraints[fnName];
    if (!cmp) throw new Error('Unknown comparison: ' + fnName);

    return cmp.apply(null, cmpArgs);
}

function parseStatements(statements) {
    return _.flatten(_.map(statements, parseStatement));
}

function parseStatement(statement) {
    return (statement.indexOf('xor') < 0) ? statement : parseXorStatement(statement);
}

function parseXorStatement(statement) {
    // E.g. 'is(xor(dog, horse), xor(Becker, Massey))'
    var doubleXorMatches = statement.match(/is\(.*(xor\((.*?)\)).*(xor\((.*?)\))\)/i);
    if (!doubleXorMatches) return parseSingleXorStatement(statement);

    // Split the statement into 2x single-xor statements
    //   E.g. 'is(xor(A,B), xor(C,D))' --> ['is(A, xor(C,D))', 'is(B, xor(C,D))']
    var firstXor = _.invoke(doubleXorMatches[2].split(','), 'trim');
    var secondXor = _.invoke(doubleXorMatches[4].split(','), 'trim');


    return [
        parseSingleXorStatement('is(' + [firstXor[0], doubleXorMatches[3]].join(', ') + ')'),
        parseSingleXorStatement('is(' + [firstXor[1], doubleXorMatches[3]].join(', ') + ')'),
        // Explicitly define it the other way too
        parseSingleXorStatement('is(' + [secondXor[0], doubleXorMatches[1]].join(', ') + ')'),
        parseSingleXorStatement('is(' + [secondXor[1], doubleXorMatches[1]].join(', ') + ')')
    ];
}

/**
 * Parse an is/xor statement, handling any order of xor.
 *   E.g. we could get "is(A, xor(B,C))", or we could get "is(xor(A,B), C))"
 * @param {string} statement
 * @return {string} Parsed standard xor statement.
 *   Produces "xor(A, B, C)" for both "is(A, xor(B, C))" and "is(xor(B, C), A)"
 */
function parseSingleXorStatement(statement) {
    var singleXorMatches = statement.match(/is\((.*)xor\((.*?)\)(.*)\)/i);
    if (!singleXorMatches) throw new Error('Detected xor, but couldn\'t find it...');

    var base = _.compact(_.invoke([singleXorMatches[1], singleXorMatches[3]].join('').split(','), 'trim'))[0];
    var xorArgs = singleXorMatches[2];

    // Standardize "A is (B xor C)" and "(B xor C) is A"
    // as "xor(A, B, C)"
    return 'xor(' + [base, xorArgs].join(', ') + ')';
}


/***********************************************************************************************************************
 * Logic Comparison functions
 **/

/**
 * Apply an equality constraint, saying a set of entities are related.
 * @param {{type}} context      - A context for the constraint.
 *                                  Not used, but declared for consistency with other constraint functions
 * @param {...Entity} entities   - 2 or more entities
 * @return {Entity[]} The modified entities
 */
function is(context/*, ...entities*/) {
    var entities = _.rest(_.toArray(arguments));
    _.each(entities, function setRelationships(entity, idx) {
        // Get the entities other than this one
        var others = entities.slice(0, idx).concat(entities.slice(idx + 1));

        // For each, ensure they are each other's only relationships of that type
        _.each(others, function setEqual(other) {
            var relationshipsToRemove = _.without(entity.relationships[other.type], other);
            entity.popRelationships(relationshipsToRemove);

            // ...and vice versa
            relationshipsToRemove = _.without(other.relationships[entity.type], entity);
            other.popRelationships(_.without(relationshipsToRemove, other));
        });
    });

    return context;
}

/**
 * Apply an inequality constraint, saying a set of entities are NOT related.
 * @param {{type}} context      - A context for the constraint.
 *                                  Not used, but declared for consistency with other constraint functions
 * @param {...Entity} entities   - 2 or more entities
 * @return {Entity[]} The modified entities
 */
function not(context/*, ...entities*/) {
    var entities = _.rest(_.toArray(arguments));

    // Dissolve each of the relationships
    _.each(entities, function applyNot(entity) {
        var otherEntities = _.without(entities, entity);
        entity.popRelationships(otherEntities);
    });

    return context;
}

/**
 * Apply an Xor constraint.  E.g. "A is either B or C"
 * @param context
 * @param {Entity} base
 * @param {Entity} xorA
 * @param {Entity} xorB
 */
function xor(context, base, xorA, xorB) {
    // First, it tells us A and B are **unrelated**
    xorA.popRelationships(xorB);

    // Consider that "A is B xor C" <==> If A=B, then A!=C
    //                                   Else if A=C, then A!=B
    //                                   **and likewise with the reverse**
    if (base.is(xorA)) {
        base.popRelationships(xorB);
    } else if (base.is(xorB)) {
        base.popRelationships(xorA);
    } else if (!base.hasRelationship(xorA)) {
        is(context, base, xorB);
    } else if (!base.hasRelationship(xorB)) {
        is(context, base, xorA);
    }

    // Additionally, if A and B are the same Entity Type,
    //   then we KNOW A cannot be anything else in their Entity Type
    if (xorA.type === xorB.type) {
        var othersOfType = _.without(context.entitiesByType[xorA.type], xorA, xorB);
        base.popRelationships(othersOfType);
    }

    // Additionally, additionally...  well, whoa.
    //
    // On Logic-puzzles.org, I was given this hint:
    //   CLUE #2: If $30,000 does not equal Finance,
    //            and Lauren and Nettie can only be paired with either $30,000 or German Poetry,
    //            then Lauren cannot be equal to Finance.
    //            Mark the highlighted cell as FALSE. (+120 sec. penalty)
    //
    // In other words, we can apply some intersection knowledge to base
    var otherTypes = _.without(context.types, base.type);
    _.each(otherTypes, function applyIntersections(type) {
        var validRelationships = _.union(
            xorA.type === type ? [xorA] : xorA.relationships[type],
            xorB.type === type ? [xorB] : xorB.relationships[type]
        );
        var invalidRelationships = _.difference(base.relationships[type], validRelationships);
        base.popRelationships(invalidRelationships);
    });

}

/**
 * Given a target comparison function (e.g. lesserCompare), produce a wrapping function
 *   which will reverse the entity arguments when invoked,
 *   effectively producing the opposite effect of the target comparison (e.g. greaterCompare)
 * @param {Function} cmpFn
 * @return {Function} A curried function with a standard cmpFn signature (context, entities)
 */
function complement(cmpFn) {
    return function greaterCompare(entityA, entityB, offset) {
        // Reverse the entity args
        return cmpFn(entityB, entityA, offset);
    };
}

/**
 * Make a 'lesser' comparison (e.g. 'before')
 * The function can be provided a "context" for what 'before' applies to, OR it can make an attempt to introspect this.
 *
 * Introspection is based on a simple intuition:
 *   If our space has 3 Entity Types, and 2 are used in this comparison,
 *   that tells us the 3rd, unused, Entity Type is the context (e.g. for before() and, by complement, after())
 *
 * @param {{type}} context
 * @param {Entity} entityA      - An entity with a "smaller" context.type
 * @param {Entity} entityB      - An entity with a "larger" context.type
 * @param {string} [qty]        - An optional offset, such as "2 days".
 */
function lesserCompare(context, entityA, entityB, qty) {
    // This means they are not related
    entityA.popRelationships(entityB);

    // If they have different types, that provides context for which Entity Type 'before' refers to
    if ((entityA.type === entityB.type) && !context.type) setContextDifferentTypes(context, qty);

    // Try to guess the context through inference
    if (!_.property('type')(context)) setContextWithInference(context, entityA, entityB);

    // If that fails, we can't do anything
    if (!_.property('type')(context)) return context;

    // Parse the 'qty' into an offset, defined as the difference in Indexes between entities in 'context'
    // E.g. If context -> [ 100, 150, 200 ] and qty=50, then offset=1
    //      If context -> [ Monday, Tuesday, Wednesday] and qty = 1 day, then offset=1

    // In some puzzles, the offset could be interpretted as an Entity, wich we don't want.
    //   E.g. "2 gold" in ./puzzles/game3
    qty = _.property('name')(qty) || qty;
    var offset = getOffset(context, qty);


    var cmpA = entityA.relationships[context.type];
    var cmpB = entityB.relationships[context.type];

    // No comparisons to be made, because A and B have only a single relationship in the context type.
    //   In other words, A and B have already solved their relationships in the context type.
    if (_.size(cmpA) === 1 && _.size(cmpB) === 1) return null;

    //
    // At this point, we know a comparison can be attempted...
    //   Assume context relationships are **SORTED IN ASCENDING ORDER**
    //


    // Consider some cases:
    //   1) A->[123] before B->[123]    ==> A->[12] B->[23]
    //   2) A->[1] before B->[123]      ==> A->[1] B->[23]
    //   3) A->[123] before B->[3]      ==> A->[12] B->[3]
    //   4) A->[23] before B->[123]     ==> A->[2] B->[3]
    //   5) A->[123] before B->[234]    ==> A->[123] B->[234]
    //   6) A->[34] before B->[12345]   ==> A->[34] B->[45]

    // For each a:cmpA, if there isn't a b:cmpB | a < b;
    //   then discard a
    _.each(cmpA, function checkA(a) {
        var cmpsB = _.filter(cmpB, _.partial(cmp, a)/*(b)*/);
        if (_.isEmpty(cmpsB)) {
            entityA.popRelationships(a);
        }
    });

    // For each b:cmpB, if there isn't an a:cmpA | a < b;
    //   then discard b
    _.each(cmpB, function checkB(b) {
        var cmpsA = _.filter(cmpA, _.partial(cmp, _, b)/*(a)*/);
        if (_.isEmpty(cmpsA)) {
            entityB.popRelationships(b);
        }
    });

    return context;


    function cmp(a, b) {
        var idxA = _.findIndex(context.entities, {name: a.name});
        var idxB = _.findIndex(context.entities, {name: b.name});

        return !offset ? (idxA < idxB) : ((idxA + offset) === idxB);
    }
}

function setContext(context, type) {
    context.type = type;
    context.entities = _.where(context.allEntities, {type: context.type});
}

function setContextDifferentTypes(context, qty) {
    if (!_.isString(qty)) return null;

    var allTypes = _.uniq(_.pluck(context.allEntities, 'type'));
    var candidateTypes = _.filter(allTypes, function offsetTellsType(type) {
        return qty.indexOf(type.toLowerCase()) >= 0;
    });

    if (_.size(candidateTypes) !== 1) return null;
    setContext(context, _.first(candidateTypes));
}

function setContextWithInference(context, entityA, entityB) {
    var contextTypeCandidates = _.without(context.typeCandidates, entityA.type, entityB.type);

    if (_.size(contextTypeCandidates) === 0) throw new Error('Exception! No context candidates for comparison');
    if (_.size(contextTypeCandidates) > 1) {
        // Multiple context candidates for comparison
        context.typeCandidates = contextTypeCandidates;
        context.frustrationCount = (context.frustrationCount || 0) + 1;

        if (context.frustrationCount < 5) return null;

        // Ok, that's it!
        contextTypeCandidates = _.filter(contextTypeCandidates, function hasNumericEntities(typeCandidate) {
            var names = _.pluck(context.entitiesByType[typeCandidate], 'name');
            return _.some(names, niceParseInt);
        });
    }

    setContext(context, _.first(contextTypeCandidates));
}

function getOffset(context, qty) {
    var num = niceParseInt(qty);
    if (!num) return 0;

    var contextEntities = _.where(context.allEntities, {type: context.type});

    // We need to find the step of the context,
    if (!context.step) {
        // ... but we don't have any reference to discover the step
        if (_.isEmpty(contextEntities)) return num;

        // IMPORTANT: Assume the entities have a uniform step size
        var step = niceParseInt(contextEntities[1].name) - niceParseInt(contextEntities[0].name);
        if (_.isNaN(step)) return num;

        // If it's 0, that means we couldn't interpret a step from the contexts,
        // and they likely aren't even numeric
        context.step = step || 1;
    }

    // and then use (num/step) as offset
    return num / context.step;
}

function niceParseInt(x) {
    if (_.isNumber(x)) return x || 0;
    if (!_.isString(x)) return 0;

    var num = parseFloat(_.first(x.match(/(\d+(\.\d+)?)/)), 10);
    var unit = x.slice(num.toString().length).trim();
    return Math.round(num * getMagnitude(unit));
}

function getMagnitude(unit) {
    unit = unit.toLowerCase().trim();

    return (unit === 'billion') ? 1000000000
        : (unit === 'million') ? 1000000
        : (unit === 'thousand') ? 1000
        : 1;
}

/***********************************************************************************************************************
 * Expose functions for callers to use
 **/
exports.analyze = analyze;
