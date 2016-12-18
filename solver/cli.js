#! /usr/bin/env node

var async = require('async');
var _ = require('underscore');
var fs = require('fs');
var cliHelper = require('./lib/cliHelper');
var analyzer = require('./lib/AnalyzeLogicPuzzle');
var colors = require('colors');

var options = {
    boolean: ['help', 'verbose', 'quiet', 'recursive'],
    alias: {
        help: ['h'],
        verbose: ['v'],
        in: ['i'],
        quiet: ['q'],
        recursive: ['r'],
        num: ['n']
    },
    default: {
        in: '../data/puzzles',
        recursive: false,
        verbose: false,
        quiet: false,
        num: 50
    }
};

var argv = require('minimist')(process.argv.slice(2), options);

if (argv.help) {
    cliHelper.printHelp(argv);
    return process.exit(0);
}


// Step 1.
var topDir = argv.in;
var quiet = argv.quiet;
var recursive = argv.recursive;
var num = argv.num;

var puzzleDirs = !recursive ? [''] : fs.readdirSync(topDir);

var allRes = _.reduce(puzzleDirs, function evaluatePuzzle(acc, puzzleDir) {
    var dir = [topDir, puzzleDir].join('/').replace('//', '/');

    var entityInfo = cliHelper.fileContent([dir, 'entities.txt'].join('/')).trim().split('\n');
    var types = entityInfo[0].trim().split(',');
    var entities = _.reduce(types, function mapEntities(acc, type, idx) {
        acc[type] = entityInfo[2 + idx].trim().split(',');
        return acc;
    }, {});


    var success = false;
    var diff = '';

    var statements = cliHelper.fileContent([dir, 'parseExpected.txt'].join('/')).trim().split('\n');
    try {
        var answers = cliHelper.fileContent([dir, 'answers.txt'].join('/')).trim().split('\n');
        answers = _.invoke(answers.sort(), 'trim');

        acc.total += _.size(answers);
        var res = analyzer.analyze(entities, statements, answers, num, quiet);
        acc.correct += res.correct;
        success = res.success;
        diff = res.out;
    } catch (e) {
        console.log(' ✗ '.red + dir + '\n   Error: '.red.bold + e.message.red + '\n');
        if (!quiet) console.error(e.stack.red);
        return acc;
    }

    var msg = success ? (' ✔ '.green + dir) : (' ✗ '.red + dir + '\n' + diff + '\n');
    console.log(msg);
    return acc;
}, {correct: 0, total: 0});

var accuracy = (allRes.correct / allRes.total);
var summary = (100 * accuracy).toFixed(1) + '% accuracy (' + allRes.correct + ' of ' + allRes.total + ')';
var color = (accuracy < 0.7) ? 'red' : (accuracy < 0.9) ? 'yellow' : 'green';
console.log(summary.bold[color] + '\n');

var allSuccess = _.every(_.pluck(allRes, 'success'));
process.exit(0);
