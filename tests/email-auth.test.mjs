import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EmailAuth,normaliseCode} from '../web/email-auth.mjs';

function fixture(overrides={}) {
 const calls=[];let time=1000;
 const auth={signInWithOtp:async args=>{calls.push(args);return {error:null};},verifyOtp:async args=>{calls.push(args);return {data:{session:{user:{email:args.email}}}};},...overrides};
 const flow=new EmailAuth(auth,{now:()=>time,sentAt:new Map(),redirectTo:'https://league.example/'});
 flow.chooseEmail(' PLAYER@Example.com ');
 return {flow,calls,advance:ms=>{time+=ms;}};
}
test('normalises email and preserves the redirect for previously issued link templates',async()=>{
 const {flow,calls}=fixture();await flow.send();
 assert.deepEqual(calls,[{email:'player@example.com',options:{emailRedirectTo:'https://league.example/'}}]);
 assert.equal(flow.remaining(),60);
});
test('initial send and every resend enforce a full minute per email',async()=>{
 const {flow,calls,advance}=fixture();await flow.send();
 await assert.rejects(flow.send(),/60 seconds/);advance(59_001);
 await assert.rejects(flow.send(),/1 seconds/);advance(999);await flow.send();
 assert.equal(calls.length,2);assert.equal(flow.remaining(),60);
 flow.chooseEmail('other@example.com');assert.equal(flow.remaining(),0);
 flow.chooseEmail('player@example.com');assert.equal(flow.remaining(),60);
});
test('concurrent sends, verification and email changes cannot race',async()=>{
 let release;const {flow}=fixture({signInWithOtp:()=>new Promise(resolve=>{release=resolve;})});
 const request=flow.send();assert.equal(flow.busy,true);
 await assert.rejects(flow.send(),/Please wait/);
 await assert.rejects(flow.verify('12345678'),/Please wait/);
 assert.throws(()=>flow.chooseEmail('other@example.com'),/Please wait/);
 release({error:null});await request;assert.equal(flow.busy,false);
});
test('failed sends recover and rate limits impose a retry delay',async()=>{
 let response={error:{message:'Try later',status:429}};
 const {flow,advance}=fixture({signInWithOtp:async()=>response});
 await assert.rejects(flow.send(),{message:'Try later'});assert.equal(flow.busy,false);assert.equal(flow.remaining(),60);
 advance(60_000);response={error:{message:'Email service unavailable'}};
 await assert.rejects(flow.send(),{message:'Email service unavailable'});assert.equal(flow.remaining(),0);
 response={error:null};await flow.send();assert.equal(flow.remaining(),60);
});
test('leading zeroes and pasted whitespace survive; supported code lengths reach Supabase',async()=>{
 const {flow,calls}=fixture();assert.equal(normaliseCode(' 0012 3456\n'),'00123456');
 for(const value of ['001234',' 0012 3456\n','0012345678']) await flow.verify(value);
 assert.deepEqual(calls.map(c=>c.token),['001234','00123456','0012345678']);
 assert.ok(calls.every(c=>c.email==='player@example.com'&&c.type==='email'));
 for(const value of ['','12345','12345678901','abcdef12']) await assert.rejects(flow.verify(value),/numeric code/);
});
test('invalid or expired codes preserve the account and allow a successful retry',async()=>{
 let expired=true;const {flow}=fixture({verifyOtp:async()=>expired?{error:{code:'otp_expired',status:403}}:{data:{session:{user:{id:'existing-player'}}}}});
 await assert.rejects(flow.verify('12345678'),/invalid or has expired/);
 assert.equal(flow.email,'player@example.com');assert.equal(flow.busy,false);
 expired=false;assert.equal((await flow.verify('01234567')).user.id,'existing-player');
});
test('verification locks resends and switching accounts until it finishes',async()=>{
 let release;const {flow}=fixture({verifyOtp:()=>new Promise(resolve=>{release=resolve;})});
 const verification=flow.verify('12345678');
 await assert.rejects(flow.send(),/Please wait/);assert.throws(()=>flow.chooseEmail('other@example.com'),/Please wait/);
 release({data:{session:{user:{id:'new-player'}}}});await verification;assert.equal(flow.busy,false);
});
test('a response without a session cannot be treated as successful sign-in',async()=>{
 const {flow}=fixture({verifyOtp:async()=>({data:{user:{}}})});
 await assert.rejects(flow.verify('12345678'),/not completed/);assert.equal(flow.busy,false);
});
