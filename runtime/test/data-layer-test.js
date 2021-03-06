/**
 * @license
 * Copyright (c) 2017 Google Inc. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * Code distributed by Google as part of this project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

import {assert} from './chai-web.js';
import Arc from '../arc.js';
import Schema from '../schema.js';
import SlotComposer from '../slot-composer.js';
import Type from '../type.js';
import Handle from '../handle.js';

describe('entity', async function() {
  it('can be created, stored, and restored', async () => {
    let schema = new Schema({name: 'TestSchema', parents: [], sections: [{
        sectionType: 'normative',
        fields: {
            'value': 'Text'
        }
    }]});

    let arc = new Arc({slotComposer: new SlotComposer({rootContext: 'test', affordance: 'mock'}), id: 'test'});
    let entity = new (schema.entityClass())({value: 'hello world'});
    assert.isDefined(entity);
    let storage = await arc.createHandle(Type.newEntity(schema).setViewOf());
    let handle = Handle.handleFor(storage);
    await handle.store(entity);

    let list = await arc.findHandlesByType(entity.constructor.type.setViewOf())[0].toList();
    let clone = list[0];
    assert.isDefined(clone);
    assert.deepEqual(clone.rawData, {value: 'hello world'});
    assert.notEqual(entity, clone);
  });
});

describe.skip('relation', function() {
  it('can be created, stored, and restored', function() {
    let arc = new Arc({});
    let relation = new Relation(new BasicEntity('thing1'), new BasicEntity('thing2'));
    assert.isDefined(relation);
    arc.commit([relation]);
    let clone = arc.findHandlesByType(relation.constructor.type.setViewOf())[0].toList()[0];
    assert.isDefined(clone);
    assert.equal(clone.entities[0].data, 'thing1');
    assert.notEqual(relation, clone);
  });
});
