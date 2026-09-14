// Only the known membership failure should offer registration. Network, auth
// and missing-schema failures must keep their own recovery path.
export function needsRegistration(error) {
 return error?.code==='P0001' && error.message==='Your email is not on this league. Ask the organiser to add it.';
}

export function registrationError(error) {
 if(error?.code==='PGRST202' && error.message?.includes('join_league')) {
  return 'Your email is verified, but joining is not enabled yet. Ask the organiser to finish the registration setup, then try again here.';
 }
 return error?.message || 'We couldn’t reserve your seat. Please try again.';
}
