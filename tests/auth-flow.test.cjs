// Lightweight mock smoke tests. No live Supabase calls.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
async function boot({session,profile,groups=[],matches=[],clubs=[],confirmDelete=true,deleteError=null}){
 const nodes=new Map(),calls=[],requests=[],storage=new Map(),confirmations=[];let activeGroups=[...groups],removed=false;
 const element=()=>({classList:{hidden:false,toggle(k,v){if(k==='hidden')this.hidden=v;},add(k){if(k==='hidden')this.hidden=true;},remove(k){if(k==='hidden')this.hidden=false;}},textContent:'',innerHTML:'',value:'',style:{},querySelectorAll:()=>[],reset(){},click(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const user={id:'user-1',email_confirmed_at:'2026-01-01',is_anonymous:false};
 const client={auth:{getSession:async()=>({data:{session:session?{user}:null}}),getUser:async()=>({data:{user}}),onAuthStateChange(){}},rpc:async(fn,args)=>{calls.push(fn);requests.push({fn,args});if(fn==='delete_padel_group'){if(deleteError)return {error:new Error(deleteError)};activeGroups=activeGroups.filter(g=>g.group_id!==args.p_group_id);return {data:null};}if(removed&&['get_padel_dashboard','list_padel_matches'].includes(fn))return {error:new Error('You are not a member of this group')};return {data:({get_my_padel_profile:profile,get_my_padel_groups:activeGroups,get_my_padel_group:groups[0],get_padel_dashboard:{members:[],clubs},list_padel_matches:matches})[fn]};}};
 const ctx={window:{PADEL_CONFIG:{SUPABASE_URL:'https://pkyiwwolgtdqvekgndyt.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_dT6lsQRphpUtxGelUpF1Ow_0Mu19oAP'},supabase:{createClient:()=>client}},document:{getElementById:get,querySelectorAll:()=>[],querySelector:()=>element()},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location:{search:'',href:'https://ar-db.github.io/padel-connect/'},history:{replaceState(){}},URL,URLSearchParams,Intl,Date,console:{...console,error(){}},confirm:msg=>{confirmations.push(msg);return confirmDelete;},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){}};
 vm.runInNewContext(source,ctx);await new Promise(r=>setImmediate(r));return {get,calls,requests,confirmations,storage,removeExternally(){removed=true;activeGroups=[];}};
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
 console.log('PASS: admin-only delete UI, cancel, successful deletion, failed deletion and deleted-group refresh');
 console.log('PASS: Any club option, rendering and save payload');
 console.log('PASS: match creator and other-member card rendering');
 console.log('PASS: unauthenticated, new profile, returning group member, returning user without group');
})().catch(e=>{console.error(e);process.exitCode=1;});
