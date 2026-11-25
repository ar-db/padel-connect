/* Padel Connect — verified profiles and match planner. */
(() => {
  'use strict';
  const cfg=window.PADEL_CONFIG||{}, APP_URL='https://ar-db.github.io/padel-connect/';
  const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={client:null,user:null,profile:null,group:null,member:null,matches:[],clubs:[],editing:null,refreshing:null,route:0,refreshTimer:null};
  const dateToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const formatDate=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'Europe/Madrid'});
  const timeLabel=(t,d)=>{const [h,m]=t.split(':').map(Number);const fmt=n=>`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;return `${fmt(h*60+m)}–${fmt(h*60+m+d)}`;};
  const toast=(msg,bad=false)=>{const el=$('toast');el.textContent=msg;el.style.background=bad?'#8b3d35':'#173b30';el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4800);};
  const status=s=>$('connection-label').textContent=s;
  const panel=id=>{for(const p of ['auth-panel','profile-panel','setup-panel','app-panel'])$(p).classList.toggle('hidden',p!==id);$('leave-group').classList.toggle('hidden',id!=='app-panel');$('sign-out').classList.toggle('hidden',!state.user);};
  const rpc=async(fn,args={})=>{const {data,error}=await state.client.rpc(fn,args);if(error)throw error;return data;};
  const run=async(button,fn)=>{if(button?.disabled)return;if(button)button.disabled=true;try{await fn();}catch(e){console.error(e);toast(e.message||'Something went wrong. Please try again.',true);}finally{if(button)button.disabled=false;}};
  const storedKey=()=>`padel_group_id:${state.user?.id}`;
  function stopGroup(){clearInterval(state.refreshTimer);state.refreshTimer=null;state.group=null;state.member=null;state.matches=[];state.clubs=[];state.editing=null;}
  function showAuth(linking=false){panel('auth-panel');$('auth-heading').innerHTML=linking?'Keep your existing<br><span>player identity.</span>':'Sign in with<br><span>your email.</span>';$('auth-description').textContent=linking?'Verify an email on this browser to preserve your existing groups and admin rights.':'Enter your email and we’ll send a secure sign-in link. No password required.';$('email-form').classList.remove('hidden');$('email-sent-panel').classList.add('hidden');status(linking?'Secure your account':'Email verification required');}
  // Supabase returns the email link's verified session. Never trust a browser-only verified flag.
  async function authenticate(session){
    const epoch=++state.route;
    stopGroup();state.user=session?.user||null;state.profile=null;
    if(!session){showAuth();return;}
    if(session.user.is_anonymous){showAuth(true);return;}
    status('Loading your profile…');
    // Validate the authenticated user with Auth, not just local session data.
    const {data,error}=await state.client.auth.getUser();
    if(epoch!==state.route)return;
    if(error)throw error;
    state.user=data.user;
    if(!state.user?.email_confirmed_at||state.user.is_anonymous){showAuth(!!state.user?.is_anonymous);return;}
    const profile=await rpc('get_my_padel_profile');
    if(epoch!==state.route)return;
    state.profile=profile;
    if(!profile){panel('profile-panel');status('Verified · set up profile');return;}
    await routeGroups();
  }
  async function routeGroups(forcePicker=false){
    const epoch=state.route, groups=await rpc('get_my_padel_groups');
    if(epoch!==state.route)return;
    status('Connected');$('profile-greeting').textContent=`Welcome, ${state.profile.display_name}.`;
    const invite=new URLSearchParams(location.search).get('invite')||localStorage.getItem('padel_pending_invite');
    localStorage.removeItem('padel_pending_invite');
    const invited=invite&&groups.find(g=>g.invite_code.toUpperCase()===invite.toUpperCase());
    if(!forcePicker&&invited){await enterGroup(invited);return;}
    if(!forcePicker&&!invite){const remembered=localStorage.getItem(storedKey())||localStorage.getItem('padel_group_id');const chosen=groups.find(g=>g.group_id===remembered)||(groups.length===1?groups[0]:null);if(chosen){await enterGroup(chosen);return;}}
    panel('setup-panel');if(invite){$('join-code').value=invite;document.querySelector('[data-tab="join"]').click();}
    const box=$('my-groups-panel');box.classList.toggle('hidden',!groups.length);box.innerHTML=`<div class="panel-kicker">YOUR GROUPS</div><div class="my-groups-list">${groups.map((g,i)=>`<button class="my-group-button" type="button" data-group="${i}"><strong>${esc(g.group_name)}</strong><span>${g.is_admin?'Admin':'Member'} · Open →</span></button>`).join('')}</div>`;
    box.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>run(b,()=>enterGroup(groups[Number(b.dataset.group)])));
  }
  async function enterGroup(g){
    const epoch=state.route;const info=await rpc('get_my_padel_group',{p_group_id:g.group_id});if(epoch!==state.route)return;
    stopGroup();state.group={id:info.group_id,name:info.group_name,invite_code:info.invite_code};state.member={id:info.member_id,display_name:info.display_name,is_admin:info.is_admin};
    localStorage.setItem(storedKey(),info.group_id);localStorage.removeItem('padel_group_id');
    const url=new URL(location.href);if(url.searchParams.has('invite')){url.searchParams.delete('invite');history.replaceState(null,'',url);}
    $('group-title').textContent=info.group_name;$('group-code-label').textContent=`INVITE ${info.invite_code} · ${state.profile.display_name}`;
    resetEditor();$('match-list').innerHTML='<p class="muted">Loading matches…</p>';panel('app-panel');await refresh();
    // Polling also works without configuring Supabase Realtime publications.
    if(epoch===state.route&&state.group?.id===info.group_id)state.refreshTimer=setInterval(()=>{if(!document.hidden)refresh().catch(e=>{console.warn(e);status('Refresh failed');});},15000);
  }
  function resetEditor(){state.editing=null;$('match-form').reset();$('match-date').min=dateToday();$('match-date').value=dateToday();$('match-form-title').textContent='Create a match';$('save-match').innerHTML='Create match <span>+</span>';$('cancel-edit').classList.add('hidden');}
  async function refresh(){
    const id=state.group?.id, epoch=state.route;if(!id)return;if(state.refreshing?.id===id){await state.refreshing.done; if(id!==state.group?.id||epoch!==state.route)return;}let release;const ticket={id,done:new Promise(r=>{release=r;})};state.refreshing=ticket;
    try{const [dashboard,matches]=await Promise.all([rpc('get_padel_dashboard',{p_group_id:id}),rpc('list_padel_matches',{p_group_id:id})]);if(epoch!==state.route||id!==state.group?.id)return;state.matches=matches||[];state.clubs=dashboard.clubs||[];renderCrew(dashboard.members||[]);renderMatches();$('match-clubs').innerHTML=state.clubs.map(c=>`<option value="${esc(c.name)}">${esc(c.area||'')}</option>`).join('');$('club-list').innerHTML=state.clubs.map(c=>`<span class="club-pill">${esc(c.name)}${c.area?`<small>· ${esc(c.area)}</small>`:''}</span>`).join('')||'<span class="muted">No saved clubs yet.</span>';status('Connected');}
    catch(e){if(epoch===state.route&&id===state.group?.id&&/not a member/i.test(e.message)){stopGroup();localStorage.removeItem(storedKey());await routeGroups(true);}throw e;}
    finally{if(state.refreshing===ticket)state.refreshing=null;release();}
  }
  function renderCrew(members){$('member-count').textContent=`${members.length} players`;$('crew-count').textContent=members.length;$('crew-list').innerHTML=members.map(m=>`<div class="crew-person"><div class="avatar">${esc(m.display_name.slice(0,2).toUpperCase())}</div><div class="crew-person-info"><strong>${esc(m.display_name)}</strong>${m.id===state.member.id?'<small>You'+(state.member.is_admin?' · Admin':'')+'</small>':''}</div>${state.member.is_admin&&m.id!==state.member.id?`<button class="remove-member-button" data-member="${esc(m.id)}">Remove</button>`:''}</div>`).join('');$('crew-list').querySelectorAll('[data-member]').forEach(b=>b.onclick=()=>run(b,async()=>{if(!confirm('Remove this member and their match positions from this group?'))return;await rpc('remove_padel_group_member',{p_group_id:state.group.id,p_member_id:b.dataset.member});await refresh();toast('Member removed.');}));}
  function renderMatches(){
    $('match-list').innerHTML=state.matches.map((m,i)=>{
      const players=m.players||[],me=players.find(p=>p.member_id===state.member.id),empty=[1,2,3,4].filter(n=>!players.some(p=>p.slot===n));
      const slot=n=>{const p=players.find(x=>x.slot===n);return p?`<div class="match-player occupied"><span class="avatar">${esc(p.display_name.slice(0,2).toUpperCase())}</span><strong>${esc(p.display_name)}</strong>${p.member_id===state.member.id?'<small>You</small>':''}${(m.can_manage||p.member_id===state.member.id)?`<button type="button" class="text-button player-remove" data-act="leave" data-index="${i}" data-player="${esc(p.member_id)}">${p.member_id===state.member.id?'Leave':'Remove'}</button>${empty.length&&(!m.registration_closed||m.can_manage)?`<select class="move-player" aria-label="Move ${esc(p.display_name)}" data-index="${i}" data-player="${esc(p.member_id)}"><option value="">Move to…</option>${empty.map(s=>`<option value="${s}">Team ${s<3?'A':'B'} · ${s%2?1:2}</option>`).join('')}</select>`:''}`:''}</div>`:`<button class="match-player vacant" data-act="join" data-index="${i}" data-slot="${n}" ${me||m.registration_closed?'disabled':''}><span class="empty-avatar">+</span><strong>${me?'Open spot':m.registration_closed?'Closed':'Join'}</strong><small>Player ${n%2?1:2}</small></button>`;};
      const label=players.length===4?'4/4 · Full':m.registration_closed?`${players.length}/4 · Closed`:`${players.length}/4 · ${4-players.length} ${4-players.length===1?'spot':'spots'} left`;
      return `<article class="match-card"><div class="match-top"><div><div class="panel-kicker">${esc(formatDate(m.match_date))}</div><h4>${esc(timeLabel(m.start_time,m.duration))} <small>· ${m.duration} min</small></h4><p class="match-location">${esc(m.location)}</p></div><span class="match-status ${players.length===4?'full':''}">${label}</span></div><div class="match-teams"><div class="team"><div class="team-label">TEAM A</div><div class="team-players">${slot(1)}${slot(2)}</div></div><div class="vs">VS</div><div class="team"><div class="team-label">TEAM B</div><div class="team-players">${slot(3)}${slot(4)}</div></div></div><div class="match-actions"><button class="secondary-button" data-act="share" data-index="${i}">WhatsApp ↗</button>${m.can_manage?`<button class="secondary-button" data-act="edit" data-index="${i}">Edit</button><button class="secondary-button" data-act="${m.registration_closed?'open':'close'}" data-index="${i}">${m.registration_closed?'Reopen':'Close sign-up'}</button><button class="remove-member-button" data-act="cancel" data-index="${i}">Cancel match</button>`:''}</div></article>`;
    }).join('')||'<div class="empty-matches"><strong>No upcoming matches</strong><p>Create the first match for your crew.</p></div>';
    $('match-list').querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{const m=state.matches[Number(b.dataset.index)];if(!m)return;if(b.dataset.act==='share'){share(matchMessage(m));return;}if(b.dataset.act==='edit'){editMatch(m);return;}run(b,()=>matchAction(m,b.dataset.act,Number(b.dataset.slot)||null,b.dataset.player||null));});
    $('match-list').querySelectorAll('.move-player').forEach(s=>s.onchange=()=>{if(!s.value)return;const m=state.matches[Number(s.dataset.index)];if(m)run(s,()=>matchAction(m,'move',Number(s.value),s.dataset.player));});
  }
  async function matchAction(m,act,slot,member){
    try{if(['join','leave','move'].includes(act)){if(act==='leave'&&member!==state.member.id&&!confirm('Remove this player?'))return;await rpc('change_padel_match_player',{p_group_id:state.group.id,p_match_id:m.id,p_action:act,p_slot:slot,p_member_id:member});}else{if(act==='cancel'&&!confirm('Cancel this match for all players?'))return;await rpc('manage_padel_match',{p_group_id:state.group.id,p_match_id:m.id,p_action:act});}toast('Match updated.');}finally{await refresh();}
  }
  function editMatch(m){state.editing=m.id;$('match-form-title').textContent='Edit match';$('match-date').value=m.match_date;$('match-time').value=m.start_time.slice(0,5);$('match-duration').value=m.duration;$('match-location').value=m.location;$('save-match').innerHTML='Save changes <span>→</span>';$('cancel-edit').classList.remove('hidden');$('match-form').scrollIntoView({behavior:'smooth',block:'center'});}
  function inviteUrl(){const u=new URL(APP_URL);u.searchParams.set('invite',state.group.invite_code);return u.href;}
  function matchMessage(m){const names=[1,2,3,4].map(n=>m.players.find(p=>p.slot===n)?.display_name||'Open');return `🎾 ${state.group.name}\n${formatDate(m.match_date)} · ${timeLabel(m.start_time,m.duration)} (${m.duration} min)\n${m.location}\nTeam A: ${names[0]} / ${names[1]}\nTeam B: ${names[2]} / ${names[3]}\n${m.players.length}/4 players${m.registration_closed?' · Registration closed':''}\n${inviteUrl()}`;}
  function share(text){window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');}
  $('year').textContent=new Date().getFullYear();
  $('match-time').innerHTML=Array.from({length:11},(_,i)=>{const n=17*60+i*30,t=`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;return `<option value="${t}">${t}</option>`;}).join('');
  $('email-form').onsubmit=e=>{e.preventDefault();run($('send-code-button'),async()=>{
    if(!state.client)throw new Error('Configure your Supabase URL and public key in config.js first.');
    const email=$('auth-email').value.trim().toLowerCase(),{data,error}=await state.client.auth.getSession();if(error)throw error;
    // Retain invite context on the same browser; use exact authorized redirect URL.
    const invite=new URLSearchParams(location.search).get('invite');if(invite)localStorage.setItem('padel_pending_invite',invite);
    const result=data.session?.user?.is_anonymous?await state.client.auth.updateUser({email},{emailRedirectTo:APP_URL}):await state.client.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:APP_URL}});if(result.error)throw result.error;
    $('email-form').classList.add('hidden');$('email-sent-panel').classList.remove('hidden');$('email-sent-address').textContent=email;toast('Check your email for the sign-in link.');
  });};
  $('change-email-button').onclick=()=>{$('email-sent-panel').classList.add('hidden');$('email-form').classList.remove('hidden');};
  $('profile-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{state.profile=await rpc('save_my_padel_profile',{p_display_name:$('profile-name').value.trim()});await routeGroups();});};
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===t));$('join-form').classList.toggle('hidden',t.dataset.tab!=='join');$('create-form').classList.toggle('hidden',t.dataset.tab!=='create');});
  $('join-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const g=await rpc('join_padel_group',{p_invite_code:$('join-code').value.trim(),p_display_name:state.profile.display_name});await enterGroup(g);});};
  $('create-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const g=await rpc('create_padel_group',{p_group_name:$('new-group-name').value.trim(),p_display_name:state.profile.display_name});await enterGroup(g);});};
  $('match-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{await rpc('save_padel_match',{p_group_id:state.group.id,p_match_id:state.editing,p_match_date:$('match-date').value,p_start_time:$('match-time').value,p_duration:Number($('match-duration').value),p_location:$('match-location').value.trim()});toast(state.editing?'Match updated.':'Match created. Choose your player position.');resetEditor();await refresh();});};
  $('cancel-edit').onclick=resetEditor;$('refresh-matches').onclick=e=>run(e.currentTarget,refresh);
  $('club-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{await rpc('add_padel_club',{p_group_id:state.group.id,p_name:$('club-name').value.trim(),p_area:$('club-area').value.trim()||null});$('club-form').reset();await refresh();toast('Club added.');});};
  $('copy-invite').onclick=e=>run(e.currentTarget,async()=>{await navigator.clipboard.writeText(inviteUrl());toast('Invite copied.');});$('share-whatsapp').onclick=()=>share(`Join our private Padel Connect crew: ${inviteUrl()}`);
  $('leave-group').onclick=e=>run(e.currentTarget,async()=>{++state.route;stopGroup();localStorage.removeItem(storedKey());await routeGroups(true);});
  $('sign-out').onclick=e=>run(e.currentTarget,async()=>{const {error}=await state.client.auth.signOut({scope:'local'});if(error)throw error;localStorage.removeItem('padel_pending_invite');await authenticate(null);});
  async function init(){
    if(!cfg.SUPABASE_URL||cfg.SUPABASE_URL.includes('YOUR-')||!cfg.SUPABASE_ANON_KEY||cfg.SUPABASE_ANON_KEY.includes('YOUR_')){showAuth();status('Setup required');$('auth-description').textContent='Keep your existing configured config.js or add your Supabase URL and public key.';return;}
    state.client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const pending=localStorage.getItem('padel_pending_invite');if(pending&&!new URLSearchParams(location.search).has('invite')){const url=new URL(location.href);url.searchParams.set('invite',pending);history.replaceState(null,'',url);}
    const {data,error}=await state.client.auth.getSession();if(error)throw error;
    if(data.session&&!data.session.user.is_anonymous)localStorage.removeItem('padel_pending_invite');
    // Event callback is deferred so no Supabase calls are made while its auth lock is held.
    state.client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'&&state.user)setTimeout(()=>authenticate(null).catch(fail),0);else if((event==='SIGNED_IN'||event==='USER_UPDATED')&&session&&(!state.user||state.user.id!==session.user.id||state.user.is_anonymous!==session.user.is_anonymous))setTimeout(()=>authenticate(session).catch(fail),0);});
    await authenticate(data.session);
  }
  function fail(e){console.error(e);status('Setup or login error');toast(e.message||'Unable to connect.',true);if(!state.user)showAuth();else {panel('auth-panel');$('email-form').classList.add('hidden');$('email-sent-panel').classList.add('hidden');$('auth-heading').textContent='Could not load your account';$('auth-description').textContent='Confirm the profile and match migration was applied, then reload. You can also sign out and try again.';}}
  init().catch(fail);
})();
