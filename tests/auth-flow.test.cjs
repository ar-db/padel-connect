// Lightweight mock smoke tests. No live Supabase calls.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
async function boot({session,profile,groups=[],matches=[],clubs=[],confirmDelete=true,deleteError=null,email="first@example.com",userId="user-1",pending=null,rawProfile=false,registrationName="Registered Player",registrationProfile=null,now="2026-11-25T20:00:00Z"}){
 const nodes=new Map(),calls=[],requests=[],storage=new Map(),confirmations=[];let activeGroups=[...groups],removed=false,offline=false,clock=Date.parse(now),tick,visibility,focus;
 class TestDate extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const element=()=>({classList:{hidden:false,toggle(k,v){if(k==='hidden')this.hidden=v;},add(k){if(k==='hidden')this.hidden=true;},remove(k){if(k==='hidden')this.hidden=false;}},textContent:'',innerHTML:'',value:'',style:{},querySelectorAll:()=>[],reset(){},click(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 let user={id:userId,email,email_confirmed_at:'2026-01-01',is_anonymous:false};
 let authCallback; if(pending)storage.set("padel_pending_email_verification",JSON.stringify({email:pending,at:clock}));
 let savedProfile=profile&&!rawProfile?{user_id:user.id,email:user.email,...profile}:profile;
 const client={auth:{getSession:async()=>({data:{session:session?{user}:null}}),getUser:async()=>({data:{user}}),onAuthStateChange(fn){authCallback=fn;}},rpc:async(fn,args)=>{calls.push(fn);requests.push({fn,args});if(fn==='register_my_padel_profile'){if(args.p_expected_email!==user.email||args.p_expected_user_id!==user.id)return {error:new Error('Account changed')};savedProfile=savedProfile||registrationProfile||{user_id:user.id,email:user.email,display_name:registrationName};return {data:savedProfile};}if(fn==='delete_padel_group'){if(deleteError)return {error:new Error(deleteError)};activeGroups=activeGroups.filter(g=>g.group_id!==args.p_group_id);return {data:null};}if(offline&&['get_padel_dashboard','list_padel_matches'].includes(fn))return {error:new Error('Offline')};if(removed&&['get_padel_dashboard','list_padel_matches'].includes(fn))return {error:new Error('You are not a member of this group')};return {data:({get_my_padel_profile:savedProfile,get_my_padel_groups:activeGroups,get_my_padel_group:groups[0],get_padel_dashboard:{members:[],clubs},list_padel_matches:matches})[fn]};}};
 const ctx={window:{addEventListener:(event,fn)=>{if(event==='focus')focus=fn;},PADEL_CONFIG:{SUPABASE_URL:'https://pkyiwwolgtdqvekgndyt.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_dT6lsQRphpUtxGelUpF1Ow_0Mu19oAP'},supabase:{createClient:()=>client}},document:{addEventListener:(event,fn)=>{if(event==='visibilitychange')visibility=fn;},getElementById:get,querySelectorAll:()=>[],querySelector:()=>element()},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location:{search:'',href:'https://ar-db.github.io/padel-connect/'},history:{replaceState(){}},URL,URLSearchParams,Intl,Date:TestDate,console:{...console,error(){},warn(){}},confirm:msg=>{confirmations.push(msg);return confirmDelete;},setTimeout:(fn,delay)=>delay===0?setTimeout(fn,0):0,clearTimeout(){},setInterval:fn=>{tick=fn;return 1;},clearInterval(){}};
 vm.runInNewContext(source,ctx);await new Promise(r=>setImmediate(r));return {get,calls,requests,confirmations,storage,setClock(value){clock=Date.parse(value);},setOffline(value){offline=value;},async tick(){tick();await new Promise(r=>setImmediate(r));},async resume(){visibility();await new Promise(r=>setImmediate(r));},async focus(){focus();await new Promise(r=>setImmediate(r));},async switchAccount(next,profile){user=next;savedProfile=profile;authCallback("SIGNED_IN",{user});await new Promise(r=>setTimeout(r,20));},removeExternally(){removed=true;activeGroups=[];}};
}
(async()=>{
 let r=await boot({session:false});assert.equal(r.get('auth-panel').classList.hidden,false);assert.deepEqual(r.calls,[]);
 r=await boot({session:true,profile:null});assert.equal(r.get('profile-panel').classList.hidden,false);assert.deepEqual(r.calls,['get_my_padel_profile']);
 r=await boot({session:true,profile:{display_name:'Player'},groups:[{group_id:'g',group_name:'Crew',invite_code:'CODE',member_id:'m',display_name:'Player',is_admin:true}]});assert.equal(r.get('app-panel').classList.hidden,false);assert.equal(r.get('profile-panel').classList.hidden,true);assert.equal(r.get('group-title').textContent,'Crew');assert.ok(r.calls.includes('list_padel_matches'));
 r=await boot({session:true,profile:{display_name:'Player'}});assert.equal(r.get('setup-panel').classList.hidden,false);assert.equal(r.get('profile-panel').classList.hidden,true);
 const match={id:'match-1',match_date:'2026-12-01',start_time:'18:00:00',duration:90,location:'Vals Club',registration_closed:false,can_manage:true,players:[{slot:1,member_id:'m',display_name:'Creator'}]};
 const group={group_id:'g',group_name:'Crew',invite_code:'CODE',member_id:'m',display_name:'Creator',is_admin:true};
 r=await boot({session:true,profile:{display_name:'Creator'},groups:[group],matches:[match]});
 let html=r.get('match-list').innerHTML;assert.match(html,/1\/4 · 3 spots left/);assert.match(html,/TEAM A[\s\S]*?<strong>Creator<\/strong>/);assert.equal((html.match(/class="match-player vacant"/g)||[]).length,3);assert.equal((html.match(/<strong>Open spot<\/strong>/g)||[]).length,3);
 r=await boot({session:true,profile:{display_name:'Friend'},groups:[{...group,member_id:'other',display_name:'Friend',is_admin:false}],matches:[{...match,can_manage:false}]});
 html=r.get('match-list').innerHTML;assert.equal((html.match(/<strong>Join<\/strong>/g)||[]).length,3);assert.equal((html.match(/class="match-player vacant"[^>]*disabled/g)||[]).length,0);
 r=await boot({session:true,profile:{display_name:'Creator'},groups:[group],matches:[{...match,location:'Any'}],clubs:[{name:'Vals Club'},{name:'any'}]});
 assert.match(r.get('match-list').innerHTML,/Any · Club to be decided/);
 assert.equal((r.get('match-clubs').innerHTML.match(/value="Any"/g)||[]).length,1);
 assert.match(r.get('match-clubs').innerHTML,/value="Vals Club"/);
 r.get('choose-any-club').onclick();assert.equal(r.get('match-location').value,'Any');
 r.get('match-location').value=' ANY ';r.get('match-time').value='18:00';r.get('match-duration').value='90';r.get('match-form').onsubmit({preventDefault(){},submitter:r.get('save-match')});await new Promise(r=>setImmediate(r));
 assert.equal(r.requests.find(x=>x.fn==='save_padel_match').args.p_location,'Any');

 r=await boot({session:true,profile:{display_name:'Creator'},groups:[group],confirmDelete:false});
 assert.equal(r.get('group-admin-controls').classList.hidden,false);
 await r.get('delete-group').onclick({currentTarget:r.get('delete-group')});
 assert.equal(r.confirmations.length,1);assert.match(r.confirmations[0],/cannot be undone/i);assert.ok(!r.calls.includes('delete_padel_group'));assert.equal(r.get('app-panel').classList.hidden,false);
 r=await boot({session:true,profile:{display_name:'Creator'},groups:[group]});
 await r.get('delete-group').onclick({currentTarget:r.get('delete-group')});
 assert.equal(r.requests.find(x=>x.fn==='delete_padel_group').args.p_group_id,'g');assert.equal(r.get('setup-panel').classList.hidden,false);assert.equal(r.get('app-panel').classList.hidden,true);assert.equal(r.get('group-admin-controls').classList.hidden,true);assert.equal(r.storage.has('padel_group_id:user-1'),false);assert.equal(r.get('my-groups-panel').classList.hidden,true);
 r=await boot({session:true,profile:{display_name:'Creator'},groups:[group],deleteError:'Only owner can delete'});
 await r.get('delete-group').onclick({currentTarget:r.get('delete-group')});assert.equal(r.get('app-panel').classList.hidden,false);assert.equal(r.storage.get('padel_group_id:user-1'),'g');
 r=await boot({session:true,profile:{display_name:'Friend'},groups:[{...group,is_admin:false,member_id:'other'}]});
 assert.equal(r.get('group-admin-controls').classList.hidden,true);
 await r.get('delete-group').onclick({currentTarget:r.get('delete-group')});assert.ok(!r.calls.includes('delete_padel_group'));assert.equal(r.confirmations.length,0);
 r.removeExternally();await r.get('refresh-matches').onclick({currentTarget:r.get('refresh-matches')});assert.equal(r.get('setup-panel').classList.hidden,false);assert.equal(r.get('app-panel').classList.hidden,true);assert.equal(r.get('toast').textContent,'This group is no longer available.');
 // A different verified email must not inherit a previously entered name.
 r=await boot({session:true,email:'second@example.com',userId:'user-2',profile:null});
 assert.equal(r.get('profile-email').textContent,'second@example.com');assert.equal(r.get('profile-name').value,'');assert.equal(r.get('profile-panel').classList.hidden,false);
 r.get('profile-name').value='Second Player';r.get('profile-form').onsubmit({preventDefault(){},submitter:{}});await new Promise(r=>setImmediate(r));
 assert.equal(r.requests.find(x=>x.fn==='register_my_padel_profile').args.p_expected_email,'second@example.com');
 assert.equal(r.requests.find(x=>x.fn==='register_my_padel_profile').args.p_expected_user_id,'user-2');
 assert.equal(r.get('setup-panel').classList.hidden,false);
 r=await boot({session:true,email:'second@example.com',userId:'user-2',profile:{user_id:'user-1',email:'first@example.com',display_name:'Wrong name'},rawProfile:true});
 assert.equal(r.get('setup-panel').classList.hidden,true);assert.equal(r.get('profile-panel').classList.hidden,true);assert.match(r.get('auth-description').textContent,/identity mismatch/i);
 r=await boot({session:true,email:'first@example.com',pending:'second@example.com',profile:{display_name:'First'}});
 assert.deepEqual(r.calls,[]);assert.match(r.get('auth-description').textContent,/does not match/i);
 r=await boot({session:true,profile:{display_name:'First'}});r.get('profile-name').value='First';
 await r.switchAccount({id:'user-2',email:'second@example.com',email_confirmed_at:'2026-01-01',is_anonymous:false},null);
 assert.equal(r.get('profile-panel').classList.hidden,false);assert.equal(r.get('profile-name').value,'');assert.equal(r.get('profile-email').textContent,'second@example.com');
 await r.switchAccount({id:'user-2',email:'third@example.com',email_confirmed_at:'2026-01-01',is_anonymous:false},{user_id:'user-2',email:'second@example.com',display_name:'Second'});
 assert.equal(r.get('profile-panel').classList.hidden,true);assert.match(r.get('auth-description').textContent,/identity mismatch/i);
 r=await boot({session:true,profile:{display_name:'Original Name'}});
 r.get('profile-name').value='Changed Name';r.get('profile-form').onsubmit({preventDefault(){},submitter:{}});await new Promise(r=>setImmediate(r));
 assert.equal(r.get('profile-greeting').textContent,'Welcome, Original Name.');
 // All occupancy states expire at the same Málaga start time, including on failed refresh.
 const expiryMatches=Array.from({length:5},(_,n)=>({...match,id:`expiry-${n}`,location:`Expiry ${n}`,registration_closed:n===2,players:Array.from({length:n},(_,i)=>({slot:i+1,member_id:`p${i}`,display_name:`P${i}`}))}));
 const next={...match,id:'future',location:'Future club',start_time:'18:30:00'};
 const yesterday={...match,id:'old',location:'Old club',match_date:'2026-11-30'};
 r=await boot({session:true,profile:{display_name:'Creator'},groups:[group],matches:[yesterday,...expiryMatches,next],now:'2026-12-01T16:59:59Z'});
 assert.doesNotMatch(r.get('match-list').innerHTML,/Old club/);assert.equal((r.get('match-list').innerHTML.match(/class="match-card"/g)||[]).length,6);
 r.setOffline(true);r.setClock('2026-12-01T17:00:00Z');await r.tick();assert.doesNotMatch(r.get('match-list').innerHTML,/Expiry [0-4]/);assert.match(r.get('match-list').innerHTML,/Future club/);
 r.setOffline(false);await r.tick();assert.doesNotMatch(r.get('match-list').innerHTML,/Expiry [0-4]/); // stale server results cannot resurrect expired cards
 r.setClock('2026-12-01T17:30:00Z');await r.resume();assert.match(r.get('match-list').innerHTML,/No upcoming matches/);
 // Summer daylight saving: Madrid 18:00 equals 16:00 UTC.
 r=await boot({session:true,profile:{display_name:'Creator'},groups:[group],matches:[{...match,match_date:'2027-07-01'}],now:'2027-07-01T15:59:59Z'});
 assert.match(r.get('match-list').innerHTML,/Vals Club/);r.setClock('2027-07-01T16:00:00Z');await r.focus();assert.match(r.get('match-list').innerHTML,/No upcoming matches/);
 console.log('PASS: automatic expiry for 0–4 players, closed matches, offline refresh, stale server responses, tab resume and Madrid summer/winter time');
 console.log('PASS: mocked repeat registration preserves original name');
 console.log('PASS: independent email accounts, explicit registration, stale session rejection, mismatched profile rejection, account switching');
 console.log('PASS: admin-only delete UI, cancel, successful deletion, failed deletion and deleted-group refresh');
 console.log('PASS: Any club option, rendering and save payload');
 console.log('PASS: match creator and other-member card rendering');
 console.log('PASS: unauthenticated, new profile, returning group member, returning user without group');
})().catch(e=>{console.error(e);process.exitCode=1;});
