#! /usr/bin/env node

'use strict';

var async = require('async');
var _ = require('underscore');
var fs = require('fs');
var cliHelper = require('./lib/cliHelper');
var colors = require('colors');

var exec = require('child_process').exec;


var options = {
    boolean: ['help', 'quiet', 'recursive'],
    alias: {
        help: ['h'],
        in: ['i'],
        quiet: ['q'],
        recursive: ['r']
    },
    default: {
        in: '../data/puzzles/',
        quiet: false,
        recursive: true
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

var puzzleDirs = !recursive ? ['.'] : fs.readdirSync(topDir);
var puzzlePaths = _.map(puzzleDirs, function (dir) {
    return [topDir, dir].join('');
});

var pyParser = './lib/parse.py';
var pyArgs = ['-i'].concat(puzzlePaths, '2> /dev/null');

exec([pyParser].concat(pyArgs).join(' '), function (err, stdout, stderr) {
    if (err) throw err;

    console.log(stdout);
    // util.print(stdout);
});
