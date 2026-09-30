import {EmailAuth} from './email-auth.mjs';
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mountEmailAuth(root, auth, {redirectTo, onVerified}) {
 const flow=new EmailAuth(auth,{redirectTo});
 let timer, pending=false;
 const find=selector=>root.querySelector(selector);
 const feedback=(message='')=>{find('#auth-error').textContent=message;};
 const setBusy=value=>{
  pending=value;
  root.setAttribute('aria-busy',String(value));
  root.querySelectorAll('input,button').forEach(el=>{el.disabled=value;});
  updateResend();
 };
 function updateResend() {
  const button=find('#resend-code');
  if(!button) return;
  const seconds=flow.remaining();
  button.disabled=pending || seconds>0;
  button.textContent=seconds ? `Send another code in ${seconds}s` : 'Send another code';
 }
 async function run(action) {
  if(pending) return;
  feedback();setBusy(true);
  try { await action(); }
  catch(error) { feedback(error.message || 'We could not complete that request. Please try again.'); }
  finally { setBusy(false); }
 }
 function emailForm() {
  clearInterval(timer);
  root.innerHTML=`<section class="hero"><div class="eyebrow">Trust your instincts</div><h1>A seat at<br>the Round Table.</h1><p>Your celebrities. Your suspicions. One very competitive league.</p></section><section class="panel login"><h2>Enter the castle</h2><p class="muted">Enter your email to sign in or join the league. We’ll send you a sign-in code. New players introduce themselves after verifying their email. You can name your team later in My picks; it’s optional.</p><form id="login"><label>Email address<input type="email" id="email" required autocomplete="email" placeholder="you@example.com" value="${esc(flow.email)}"></label><p id="auth-error" role="alert"></p><button class="primary">Send sign-in code</button><button type="button" id="have-code" class="space">I already have a code</button></form></section>`;
  find('#login').addEventListener('submit',event=>{
   event.preventDefault();
   run(async()=>{
    flow.chooseEmail(find('#email').value);
    // Returning to this form must not trigger a duplicate email during cooldown.
    if(!flow.remaining()) await flow.send();
    codeForm(true);
   });
  });
  find('#have-code').addEventListener('click',()=>{
   if(pending || !find('#login').reportValidity()) return;
   try { flow.chooseEmail(find('#email').value); codeForm(false); }
   catch(error) { feedback(error.message); }
  });
 }
 function codeForm(sent) {
  clearInterval(timer);
  root.innerHTML=`<section class="hero"><div class="eyebrow">A message from the castle</div><h1>Check your<br>email.</h1><p>Your place at the Round Table awaits.</p></section><section class="panel login"><h2>Enter your sign-in code</h2><p class="muted">${sent?'We’ve sent a code to':'Use the newest code sent to'} <strong class="account-email">${esc(flow.email)}</strong>. Check your spam folder too.</p><form id="otp"><label>Sign-in code<input type="text" id="otp-code" required inputmode="numeric" autocomplete="one-time-code" maxlength="24" spellcheck="false" aria-describedby="code-help auth-error"></label><p id="code-help" class="muted">Enter all the digits from your newest email. Keep your code private.</p><p id="auth-error" role="alert"></p><button class="primary">Enter the castle</button></form><p id="auth-status" role="status"></p><button id="resend-code" class="space">Send another code</button><button id="different-email" class="space">Use another email</button></section>`;
  find('#otp-code').focus();
  find('#otp').addEventListener('submit',event=>{
   event.preventDefault();
   run(async()=>{await flow.verify(find('#otp-code').value);clearInterval(timer);await onVerified();});
  });
  find('#resend-code').addEventListener('click',()=>run(async()=>{
   await flow.send();find('#otp-code').value='';
   find('#auth-status').textContent='A new code has been sent. Use the newest email.';
  }));
  find('#different-email').addEventListener('click',()=>{if(!pending) emailForm();});
  updateResend();
  timer=setInterval(()=>{if(!find('#resend-code')) clearInterval(timer);else updateResend();},1000);
 }
 emailForm();
}
