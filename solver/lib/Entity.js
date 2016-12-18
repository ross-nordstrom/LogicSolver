/**
 * @namespace Entity
 * @memberof LogicSolver
 * @summary Produces and manages an Entity object
 * @since 12/12/15
 * @author Ross Nordstrom <nordstrom.ross@gmail.com>
 */

"use strict";

var _ = require('underscore');

/***********************************************************************************************************************
 * Main functions
 **/
function setup(quiet, type, name) {
    type = type.trim();
    name = name.trim();
    var relationships = {};

    // Instance interface. Methods all return "this" (aka Entity)
    var Entity = {
        type: type,
        name: name,
        relationships: relationships,
        pushRelationships: pushRelationships/*(entities)*/,
        popRelationships: popRelationships/*(entities)*/,
        hasRelationship: hasRelationship/*(entity)*/,
        is: is/*(entity)*/
    };

    return Entity;


    //
    // Helper functions. Nested for access to closure
    //
    function pushRelationships(/*entities*/) {
        var entities = _.flatten(_.toArray(arguments));
        var grouped = _.groupBy(entities, 'type');

        // Add each relationship based on its Entity Type
        _.each(grouped, function pushType(entities, entityType) {
            if (!relationships[entityType]) {
                relationships[entityType] = [];
            }

            relationships[entityType] = _.union(relationships[entityType], _.clone(entities));
        });

        return Entity;
    }

    function popRelationships(/*entities*/) {
        var entities = _.flatten(_.toArray(arguments));
        if (_.isEmpty(entities)) return null;

        var grouped = _.groupBy(entities, 'type');

        // Remove each relationship based on its Entity Type
        _.each(grouped, function pushType(entities, entityType) {
            if (!relationships[entityType]) return;

            // Stash the original list, so we know which other entities to operate on
            var originalSet = _.clone(relationships[entityType]);

            // Remove 'entities' from our relationship set
            relationships[entityType] = _.difference(relationships[entityType], entities);

            if (_.isEmpty(relationships[entityType])) {
                if (!quiet) console.error('Oops... This entity now has 0 relationships of type ' + type, Entity.name, _.pluck(entities, 'name'));
            }

            // If we dissolved a relationship with other entities,
            //   ensure they dissolve their link to us.
            //   And yes, there will be an extra bounce in this mutual recursion, but it won't do anything
            //     E.g. A.pop(B) -> B.pop(A) -> **A.pop(B)** -> NOOP -> Done
            _.each(entities, function removeViceVersa(otherEntity) {
                if (_.contains(originalSet, otherEntity)) return otherEntity.popRelationships(Entity);
            });

            // Bonus Grid-specific logic/constraint:
            //   If we have solved this particular "grid" (meaning entity = otherEntity),
            //   then we can tie any other relationships they have **together** because they're one and the same
            if (_.size(relationships[entityType]) === 1) {
                var otherEntity = relationships[entityType][0];
                var sharedTypes = _.intersection(_.keys(Entity.relationships), _.keys(otherEntity.relationships));

                _.each(sharedTypes, function tieTheirFates(sharedType) {
                    var mainRelationships = Entity.relationships[sharedType];
                    var otherRelationships = otherEntity.relationships[sharedType];

                    var sharedRelationships = _.intersection(mainRelationships, otherRelationships);

                    // Reuse their popRelationships() in order to notify
                    //   the recipients of their (now dissolved) relationships
                    Entity.popRelationships(_.difference(mainRelationships, sharedRelationships));
                    otherEntity.popRelationships(_.difference(otherRelationships, sharedRelationships));

                    // Now formally tie their fates together
                    otherEntity.relationships[sharedType] = Entity.relationships[sharedType] = sharedRelationships;
                });
            }
        });

        return Entity;
    }

    /**
     * Check if this Entity has a relationship with another entity
     * @param {Entity} entity
     * @return {boolean} Does it have that relationship
     */
    function hasRelationship(entity) {
        return _.contains(relationships[entity.type], entity);
    }

    /**
     * Check if this Entity is **identical** to another entity.
     *   In other words, is the other entity the only valid relationship of its type.
     * @param {Entity} entity
     * @return {boolean} Are these entities the same
     */
    function is(entity) {
        return hasRelationship(entity) && (_.size(relationships[entity.type]) === 1);
    }
}

/***********************************************************************************************************************
 * Internal helper functions (mainly for testing and pseudo-private use)
 **/


/***********************************************************************************************************************
 * Expose functions for callers to use
 **/

exports.setup = setup;
