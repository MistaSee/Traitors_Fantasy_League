// Supabase remains responsible for issuing, expiring and verifying codes.
// This controller prevents overlapping requests and keeps the resend delay when
// a player goes back to the email form. No codes or sessions are stored here.
export const resendDelay = 60_000;
export const normaliseEmail = value => String(value).trim().toLowerCase();
export const normaliseCode = value => String(value).replace(/\s/g, '');
const cooldowns = new Map();

export class EmailAuth {
 constructor(auth, {now=Date.now, sentAt=cooldowns, redirectTo}={}) {
  Object.assign(this, {auth, now, sentAt, redirectTo, email:'', busy:false});
 }
 remaining(email=this.email) {
  const until=this.sentAt.get(normaliseEmail(email)) || 0;
  return Math.max(0, Math.ceil((until-this.now())/1000));
 }
 chooseEmail(value) {
  if(this.busy) throw Error('Please wait for the current request to finish.');
  const email=normaliseEmail(value);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Enter a valid email address.');
  this.email=email;
 }
 async send() {
  if(this.busy) throw Error('Please wait for the current request to finish.');
  if(!this.email) throw Error('Enter your email address first.');
  const seconds=this.remaining();
  if(seconds) throw Error(`Please wait ${seconds} seconds before requesting another code.`);
  this.busy=true;
  try {
   const {error}=await this.auth.signInWithOtp({email:this.email, options:{emailRedirectTo:this.redirectTo}});
   if(error) {
    if(error.status===429 || error.code==='over_email_send_rate_limit') this.sentAt.set(this.email,this.now()+resendDelay);
    throw error;
   }
   this.sentAt.set(this.email,this.now()+resendDelay);
  } finally { this.busy=false; }
 }
 async verify(value) {
  if(this.busy) throw Error('Please wait for the current request to finish.');
  if(!this.email) throw Error('Enter your email address first.');
  const token=normaliseCode(value);
  // Accept supported project lengths so a configuration change cannot strand
  // players. Our production project issues eight digits; the server validates.
  if(!/^\d{6,10}$/.test(token)) throw Error('Enter the numeric code from your email.');
  this.busy=true;
  try {
   const {data,error}=await this.auth.verifyOtp({email:this.email,token,type:'email'});
   if(error) {
    if(error.code==='otp_expired' || error.status===403) throw Error('That code is invalid or has expired. Check your newest email or request another code.');
    throw error;
   }
   if(!data?.session) throw Error('Sign-in was not completed. Please request a new code.');
   return data.session;
  } finally { this.busy=false; }
 }
}
