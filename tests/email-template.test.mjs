import assert from 'node:assert/strict';
import {renderEmail} from '../supabase/functions/padel-notifications/email.ts';
const payload={date:'2026-12-01',time:'18:00',duration:90,club:'Vals & <script>Club</script>',group:'Friday <Crew>'};
for(const kind of ['reminder','full','court']){
 const e=renderEmail(kind,payload);
 assert.ok(e.text.includes('18:00–19:30 (Málaga time)'));
 assert.ok(e.html.includes('Vals &amp; &lt;script&gt;Club&lt;/script&gt;'));
 assert.ok(e.html.includes('Friday &lt;Crew&gt;'));
 assert.ok(!e.html.includes('<script>'));
 assert.deepEqual(e,renderEmail(kind,payload),'retries must use identical email content');
}
assert.match(renderEmail('full',payload).text,/does not necessarily mean the court has been reserved/);
assert.match(renderEmail('court',payload).subject,/Court booked!/);
assert.match(renderEmail('reminder',{...payload,club:'Any'}).text,/Club to be decided/);
console.log('PASS: all three templates, HTML escaping, timezone label, booking distinction, stable retry content');
