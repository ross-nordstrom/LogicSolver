/*global exports, process, require, exports */
"use strict";

var s = require("underscore.string");
var _ = require('underscore');
_.mixin(s.exports());

var fs = require('fs');

/**
 * Given a directory, recursively enumerate all child files, and list them as a flat list
 * @param {string} dirPath      -
 * @param {string[]} extensions - List of extensions to whitelist. If null, no whitelisting
 * @param {int} [ttl=5]         - A "time to live" to prevent infinite recursion
 * @returns {string[]} Children filenames
 */
function listFlatFilesInDir(dirPath, extensions, ttl) {
    ttl = _.isUndefined(ttl) ? 5 : ttl;

    // Base cases
    if (ttl <= 0) {
        return null;
    }
    if (_.isEmpty(dirPath) || !_.isString(dirPath)) {
        // No path provided
        return null;
    }

    var dirStats = fs.statSync(dirPath);
    if (!dirStats || dirStats.isFile()) {
        // Path is a file
        return [dirPath];
    }

    // Read the directory and recurse on children
    var children = fs.readdirSync(dirPath);
    return _.flatten(children.map(function (child) {
        return listFlatFilesInDir([dirPath, child].join('/'));
    }));
}

/**
 * Check if a filename has one of our extensions
 * @param extensions
 * @param filename
 */
function hasWhitelistedExtension(extensions, filename) {
    // Does the given string end in one of our extensions?
    return _.some(extensions, function strHasExtension(e) {
        return _.endsWith(filename, e)
    })
}

/**
 * Given a file path, return its size in Bytes
 * @param {string} file
 * @returns {number} File size in bytes
 */
function fileSize(file) {
    return fs.statSync(file).size;
}

/**
 * Given a file path, return its contents as a big string blob
 * @param {string} file
 * @returns {string} The file contents
 */
function fileContent(file) {
    return fs.readFileSync(file, 'utf8');
}


function inRange(start, stop) {
    return function checkInRange(val, idx) {
        return (start <= idx && idx < stop);
    };
}

/**
 * Print out help for the CLI interface
 * @param argv
 */
function printHelp(argv) {

    console.log("Usage: " + process.argv.slice(0, 2));
    console.log("\nOptions:");
    console.log("  --in (-i)            - Data directory from which to read Logic Puzzle data");
    console.log("\nFlags:");
    console.log("  --help (-h)          - Print usage");
    console.log("  --quiet (-q)         - Don't print any excess statements");
    console.log("\n\nYour args: ", argv);
}

exports.listFlatFilesInDir = listFlatFilesInDir;
exports.hasWhitelistedExtension = hasWhitelistedExtension;
exports.fileSize = fileSize;
exports.fileContent = fileContent;
exports.inRange = inRange;
exports.printHelp = printHelp;
