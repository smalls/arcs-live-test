// Copyright (c) 2017 Google Inc. All rights reserved.
// This code may only be used under the BSD style license found at
// http://polymer.github.io/LICENSE.txt
// Code distributed by Google as part of this project is also
// subject to an additional IP rights grant found at
// http://polymer.github.io/PATENTS.txt

import assert from '../../platform/assert-web.js';
import {Strategizer} from '../../strategizer/strategizer.js';
import ConnectionConstraint from './connection-constraint.js';
import Particle from './particle.js';
import Search from './search.js';
import Slot from './slot.js';
import Handle from './handle.js';
import util from './util.js';
import digest from './digest-web.js';

class Recipe {
  constructor() {
    this._particles = [];
    this._handles = [];
    this._slots = [];

    // TODO: Recipes should be collections of records that are tagged
    // with a type. Strategies should register the record types they
    // can handle. ConnectionConstraints should be a different record
    // type to particles/handles.
    this._connectionConstraints = [];

    // TODO: Change to array, if needed for search strings of merged recipes.
    this._search = null;
  }

  newConnectionConstraint(from, fromConnection, to, toConnection) {
    this._connectionConstraints.push(new ConnectionConstraint(from, fromConnection, to, toConnection));
  }

  removeConstraint(constraint) {
    let idx = this._connectionConstraints.indexOf(constraint);
    assert(idx >= 0);
    this._connectionConstraints.splice(idx, 1);
  }

  clearConnectionConstraints() {
    this._connectionConstraints = [];
  }

  newParticle(name) {
    let particle = new Particle(this, name);
    this._particles.push(particle);
    return particle;
  }

  newHandle() {
    let handle = new Handle(this);
    this._handles.push(handle);
    return handle;
  }

  newSlot(name) {
    let slot = new Slot(this, name);
    this._slots.push(slot);
    return slot;
  }

  isResolved() {
    assert(Object.isFrozen(this), 'Recipe must be normalized to be resolved.');
    return this._connectionConstraints.length == 0
        && (this._search === null || this._search.isResolved())
        && this._handles.every(handle => handle.isResolved())
        && this._particles.every(particle => particle.isResolved())
        && this._slots.every(slot => slot.isResolved())
        && this.handleConnections.every(connection => connection.isResolved())
        // Verify slot connections: all required slot connections must be resolved,
        // and for each particle their must be an at least one resolved slot connection.
        && this._particles.every(particle => {
          let connections = Object.values(particle.consumedSlotConnections);
          if (connections.length == 0) {
            return true;
          }
          return !!connections.find(connection => connection.isResolved())
              && connections.every(connection => !connection.slotSpec.isRequired || connection.isResolved());
        });
  }

  _findDuplicateHandle() {
    let seenHandles = new Set();
    return this._handles.find(handle => {
      if (handle.id) {
        if (seenHandles.has(handle.id)) {
          return handle;
        }
        seenHandles.add(handle.id);
      }
    });
  }

  _isValid() {
    return !this._findDuplicateHandle() && this._handles.every(handle => handle._isValid())
        && this._particles.every(particle => particle._isValid())
        && this._slots.every(slot => slot._isValid())
        && this.handleConnections.every(connection => connection._isValid())
        && this.slotConnections.every(connection => connection._isValid())
        && (!this.search || this.search.isValid());
  }

  get localName() { return this._localName; }
  set localName(name) { this._localName = name; }
  get particles() { return this._particles; } // Particle*
  set particles(particles) { this._particles = particles; }
  get views() { return this._handles; } // Handle*
  set views(handles) { this._handles = handles; }
  get slots() { return this._slots; } // Slot*
  set slots(slots) { this._slots = slots; }
  get connectionConstraints() { return this._connectionConstraints; }
  get search() { return this._search; }
  set search(search) {
    this._search = search;
  }
  setSearchPhrase(phrase) {
    assert(!this._search, 'Cannot override search phrase');
    if (phrase) {
      this._search = new Search(phrase);
    }
  }

  get slotConnections() { // SlotConnection*
    let slotConnections = [];
    this._particles.forEach(particle => {
      slotConnections.push(...Object.values(particle.consumedSlotConnections));
    });
    return slotConnections;
  }

  get handleConnections() {
    let handleConnections = [];
    this._particles.forEach(particle => {
      handleConnections.push(...Object.values(particle.connections));
      handleConnections.push(...particle._unnamedConnections);
    });
    return handleConnections;
  }

  isEmpty() {
    return this.particles.length == 0 &&
           this.views.length == 0 &&
           this.slots.length == 0 &&
           this._connectionConstraints.length == 0;
  }

  findView(id) {
    for (let view of this.views) {
      if (view.id == id)
        return view;
    }
  }

  findSlot(id) {
    for (let slot of this.slots) {
      if (slot.id == id)
        return slot;
    }
  }

  async digest() {
    return digest(this.toString());
  }

  normalize() {
    if (Object.isFrozen(this)) {
      return;
    }
    if (!this._isValid()) {
      let duplicateHandle = this._findDuplicateHandle();
      if (duplicateHandle)
        console.log(`Has Duplicate Handle ${duplicateHandle.id}`);

      let checkForInvalid = (name, list, f) => {
        let invalids = list.filter(item => !item._isValid());
        if (invalids.length > 0)
          console.log(`Has Invalid ${name} ${invalids.map(f)}`);
      };
      checkForInvalid('Handles', this._handles, handle => `'${handle.toString()}'`);
      checkForInvalid('Particles', this._particles, particle => particle.name);
      checkForInvalid('Slots', this._slots, slot => slot.name);
      checkForInvalid('HandleConnections', this.handleConnections, handleConnection => `${handleConnection.particle.name}::${handleConnection.name}`);
      checkForInvalid('SlotConnections', this.slotConnections, slotConnection => slotConnection.name);
      return false;
    }
    // Get handles and particles ready to sort connections.
    for (let particle of this._particles) {
      particle._startNormalize();
    }
    for (let handle of this._handles) {
      handle._startNormalize();
    }
    for (let slot of this._slots) {
      slot._startNormalize();
    }

    // Sort and normalize handle connections.
    let connections = this.handleConnections;
    for (let connection of connections) {
      connection._normalize();
    }
    connections.sort(util.compareComparables);

    // Sort and normalize slot connections.
    let slotConnections = this.slotConnections;
    for (let slotConnection of slotConnections) {
      slotConnection._normalize();
    }
    slotConnections.sort(util.compareComparables);

    if (this.search) {
      this.search._normalize();
    }

    // Finish normalizing particles and handles with sorted connections.
    for (let particle of this._particles) {
      particle._finishNormalize();
    }
    for (let handle of this._handles) {
      handle._finishNormalize();
    }
    for (let slot of this._slots) {
      slot._finishNormalize();
    }

    let seenHandles = new Set();
    let seenParticles = new Set();
    let particles = [];
    let handles = [];
    // Reorder connections so that interfaces come last.
    // TODO: update handle-connection comparison method instead?
    for (let connection of connections.filter(c => !c.type || !c.type.isInterface).concat(connections.filter(c => !!c.type && !!c.type.isInterface))) {
      if (!seenParticles.has(connection.particle)) {
        particles.push(connection.particle);
        seenParticles.add(connection.particle);
      }
      if (connection.view && !seenHandles.has(connection.view)) {
        handles.push(connection.view);
        seenHandles.add(connection.view);
      }
    }

    let orphanedHandles = this._handles.filter(handle => !seenHandles.has(handle));
    orphanedHandles.sort(util.compareComparables);
    handles.push(...orphanedHandles);

    let orphanedParticles = this._particles.filter(particle => !seenParticles.has(particle));
    orphanedParticles.sort(util.compareComparables);
    particles.push(...orphanedParticles);

    // TODO: redo slots as above.
    let seenSlots = new Set();
    let slots = [];
    for (let slotConnection of slotConnections) {
      if (slotConnection.targetSlot && !seenSlots.has(slotConnection.targetSlot)) {
        slots.push(slotConnection.targetSlot);
        seenSlots.add(slotConnection.targetSlot);
      }
      Object.values(slotConnection.providedSlots).forEach(ps => {
        if (!seenSlots.has(ps)) {
          slots.push(ps);
          seenSlots.add(ps);
        }
      });
    }

    // Put particles and handles in their final ordering.
    this._particles = particles;
    this._handles = handles;
    this._slots = slots;
    this._connectionConstraints.sort(util.compareComparables);

    Object.freeze(this._particles);
    Object.freeze(this._handles);
    Object.freeze(this._slots);
    Object.freeze(this._connectionConstraints);
    Object.freeze(this);

    return true;
  }

  clone(cloneMap) {
    // for now, just copy everything

    let recipe = new Recipe();

    if (cloneMap == undefined)
      cloneMap = new Map();

    this._copyInto(recipe, cloneMap);

    // TODO: figure out a better approach than stashing the cloneMap permanently
    // on the recipe
    recipe._cloneMap = cloneMap;

    return recipe;
  }

  mergeInto(recipe) {
    let cloneMap = new Map();
    let numHandles = recipe._handles.length;
    let numParticles = recipe._particles.length;
    let numSlots = recipe._slots.length;
    this._copyInto(recipe, cloneMap);
    return {
      views: recipe._handles.slice(numHandles),
      particles: recipe._particles.slice(numParticles),
      slots: recipe._slots.slice(numSlots)
    };
  }

  _copyInto(recipe, cloneMap) {
    function cloneTheThing(object) {
      let clonedObject = object._copyInto(recipe, cloneMap);
      cloneMap.set(object, clonedObject);
    }

    this._handles.forEach(cloneTheThing);
    this._particles.forEach(cloneTheThing);
    this._slots.forEach(cloneTheThing);
    this._connectionConstraints.forEach(cloneTheThing);
    if (this.search) {
      this.search._copyInto(recipe);
    }
  }

  updateToClone(dict) {
    let result = {};
    Object.keys(dict).forEach(key => result[key] = this._cloneMap.get(dict[key]));
    return result;
  }

  static over(results, walker, strategy) {
    return Strategizer.over(results, walker, strategy);
  }

  _makeLocalNameMap() {
    let names = new Set();
    for (let particle of this.particles) {
      names.add(particle.localName);
    }
    for (let view of this.views) {
      names.add(view.localName);
    }
    for (let slot of this.slots) {
      names.add(slot.localName);
    }

    let nameMap = new Map();
    let i = 0;
    for (let particle of this.particles) {
      let localName = particle.localName;
      if (!localName) {
        do {
          localName = `particle${i++}`;
        } while (names.has(localName));
      }
      nameMap.set(particle, localName);
    }

    i = 0;
    for (let view of this.views) {
      let localName = view.localName;
      if (!localName) {
        do {
          localName = `view${i++}`;
        } while (names.has(localName));
      }
      nameMap.set(view, localName);
    }

    i = 0;
    for (let slot of this.slots) {
      let localName = slot.localName;
      if (!localName) {
        do {
          localName = `slot${i++}`;
        } while (names.has(localName));
      }
      nameMap.set(slot, localName);
    }

    return nameMap;
  }

  // TODO: Add a normalize() which strips local names and puts and nested
  //       lists into a normal ordering.

  toString(options) {
    let nameMap = this._makeLocalNameMap();
    let result = [];
    // TODO: figure out where recipe names come from
    result.push(`recipe`);
    if (this.search) {
      result.push(this.search.toString(options).replace(/^|(\n)/g, '$1  '));
    }
    for (let constraint of this._connectionConstraints) {
      let constraintStr = constraint.toString().replace(/^|(\n)/g, '$1  ');
      if (options && options.showUnresolved) {
        constraintStr = constraintStr.concat(' // unresolved connection-constraint');
      }
      result.push(constraintStr);
    }
    for (let view of this.views) {
      result.push(view.toString(nameMap, options).replace(/^|(\n)/g, '$1  '));
    }
    for (let slot of this.slots) {
      let slotString = slot.toString(nameMap, options);
      if (slotString) {
        result.push(slotString.replace(/^|(\n)/g, '$1  '));
      }
    }
    for (let particle of this.particles) {
      result.push(particle.toString(nameMap, options).replace(/^|(\n)/g, '$1  '));
    }
    return result.join('\n');
  }
}

export default Recipe;
