import test from 'node:test';
import assert from 'node:assert/strict';
import {EditTracker, readForm, restoreForm} from '../web/edits.mjs';

test('draft selections, captain and final predictions become dirty and can be undone', () => {
  const edits = new EditTracker();
  let draft = {picks: ['4', '5'], captain: '4'};
  edits.track('picks', 'Your picks', () => draft);
  draft.captain = '5';
  assert.equal(edits.changed().length, 1);
  draft.captain = '4';
  assert.deepEqual(edits.changed(), []);
  draft.picks.pop();
  assert.equal(edits.changed().length, 1);
  edits.track('picks', 'Your picks', () => ({side: draft.side || ''}));
  draft.side = 'Traitors';
  assert.equal(edits.changed().length, 1);
});

test('saving one section cannot hide other unsaved sections', () => {
  const edits = new EditTracker();
  let counts = 0, winner = '', name = '';
  edits.track('counts', 'Event counts', () => counts);
  edits.track('season', 'Season controls', () => winner);
  edits.track('add', 'New player', () => name);
  counts = 3; winner = 'Faithful'; name = 'Test player';
  assert.deepEqual(edits.changed({except: 'counts'}).map(s => s.id), ['season', 'add']);
  assert.deepEqual(edits.changed({only: ['counts']}).map(s => s.id), ['counts']);
  // Moving to a different celebrity resets only the counts baseline.
  counts = 0;
  edits.track('counts', 'Event counts', () => counts);
  assert.deepEqual(edits.changed().map(s => s.id), ['season', 'add']);
  edits.clear();
  assert.deepEqual(edits.changed(), []);
});

test('form snapshots include checkboxes and programmatic roster copies, excluding navigation', () => {
  const fields = [
    {type: 'checkbox', checked: false},
    {type: 'select-one', value: 'Unknown'},
    {type: 'number', value: '0'},
    {type: 'select-one', value: '4', navigation: true}
  ].map(field => ({...field, hasAttribute: () => Boolean(field.navigation)}));
  const form = {querySelectorAll: () => fields};
  const edits = new EditTracker();
  edits.track('episode', 'Episode setup', () => readForm(form));
  fields[3].value = '5';
  assert.deepEqual(edits.changed(), []);
  fields[1].value = 'Faithful';
  assert.equal(edits.changed().length, 1);
  fields[1].value = 'Unknown'; fields[0].checked = true;
  assert.equal(edits.changed().length, 1);
  fields[0].checked = false; fields[2].value = '2';
  assert.equal(edits.changed().length, 1);
});

test('a successful section save preserves other edits without submitting them', () => {
  const edits = new EditTracker();
  let winner = '', counts = [0];
  const track = () => {
    edits.track('season', 'Season controls', () => [winner], values => { winner = values[0]; });
    edits.track('counts', 'Event counts', () => counts, values => { counts = values; });
  };
  track();
  winner = 'Faithful'; counts = [3];
  const pending = edits.pending({except: 'counts'});
  // The server saved only the counts; rendering uses that saved state.
  winner = ''; counts = [3]; edits.clear(); track(); edits.restore(pending);
  assert.equal(winner, 'Faithful');
  assert.deepEqual(counts, [3]);
  assert.deepEqual(edits.changed().map(s => s.id), ['season']);
});

test('restoring edits changes only edited fields, including unchecked checkboxes', () => {
  const fields = [{type:'checkbox',checked:true},{type:'number',value:'7'},{type:'number',value:'0'}]
    .map(field => ({...field, hasAttribute: () => false}));
  restoreForm({querySelectorAll: () => fields}, [false,'1','3'], [true,'1','0']);
  assert.equal(fields[0].checked, false);
  assert.equal(fields[1].value, '7');
  assert.equal(fields[2].value, '3');
});
