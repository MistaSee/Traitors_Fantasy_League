import {test} from 'node:test';
import assert from 'node:assert/strict';
import {needsRegistration, registrationError} from '../web/registration.mjs';

test('registration is offered only for the known league-membership failure',()=>{
 const error={code:'P0001',message:'Your email is not on this league. Ask the organiser to add it.'};
 assert.equal(needsRegistration(error),true);
 for(const other of [null,{},new Error('Failed to fetch'),{...error,code:'401'},{code:'P0001',message:'League is not initialised'},{code:'PGRST202',message:'read_league was not found'}]) {
  assert.equal(needsRegistration(other),false);
 }
});

test('a missing registration migration has a specific recovery message',()=>{
 assert.match(registrationError({code:'PGRST202',message:'Could not find the function public.join_league(player_name) in the schema cache'}),/joining is not enabled yet/);
 assert.equal(registrationError({message:'Failed to fetch'}),'Failed to fetch');
 assert.match(registrationError(null),/try again/);
});
