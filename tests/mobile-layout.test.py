"""Optional browser smoke test: python -m pip install playwright; run with Chromium installed."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
mock='''window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:window.testSession?{user}:null}}),getUser:async()=>({data:{user}}),onAuthStateChange(){}},rpc:async(fn,args)=>{(window.rpcCalls??=[]).push({fn,args});if(fn==='set_padel_court_booked'){window.courtBooked=args.p_booked;return {data:null};}return ({data:({get_my_padel_profile:{user_id:user.id,email:user.email,display_name:'A very long player name'},get_my_padel_groups:[group],get_my_padel_group:group,get_padel_dashboard:{members:[{id:'m',display_name:'A very long player name'},{id:'other',display_name:'Another long player name'}],clubs:[{name:'Vals Club'}]},list_padel_matches:[{id:'match-1',match_date:'2026-12-01',start_time:'18:00:00',duration:90,location:'Vals Club',court_booked:!!window.courtBooked,schedule_revision:'test-revision',registration_closed:false,can_manage:true,players:[{slot:1,member_id:'m',display_name:'A very long player name'}]},{id:'match-2',match_date:'2026-12-02',start_time:'17:30:00',duration:60,location:'Very long club name to check that the location wraps on a narrow device',registration_closed:false,can_manage:false,players:[{slot:3,member_id:'other',display_name:'Another long player name'}]}]})[fn]})}})};const user={id:'user-1',email:'longer-player-email@example.com',email_confirmed_at:'2026-01-01',is_anonymous:false};const group={group_id:'g',group_name:'Friday Padel Crew with a longer group name',invite_code:'MALAGA-7K4P',member_id:'m',display_name:'A very long player name',is_admin:true};'''
import re, shutil

def load(page,session):
    page.clock.set_fixed_time(__import__('datetime').datetime(2026,11,25,20,0,tzinfo=__import__('datetime').timezone.utc))
    html=(root/'index.html').read_text()
    html=re.sub(r'<link[^>]+(?:fonts\.googleapis|fonts\.gstatic)[^>]*>','',html)
    html=re.sub(r'<link rel="stylesheet"[^>]+>',lambda m:'<style>'+ (root/'styles.css').read_text()+'</style>',html)
    storage="const store=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}});"
    html=re.sub(r'<script src="https://cdn[^>]+></script>',lambda m:'<script>'+storage+'window.testSession='+str(session).lower()+';'+mock+'</script>',html)
    html=html.replace('<script src="config.js"></script>',"<script>window.PADEL_CONFIG={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test'}</script>")
    html=re.sub(r'<script src="app.js[^>]+></script>',lambda m:'<script>'+(root/'app.js').read_text()+'</script>',html)
    page.set_content(html)

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),args=['--no-sandbox'])
    for width in (320,375,390,430,600,768,1024,1440):
        page=browser.new_page(viewport={'width':width,'height':844})
        load(page,True);page.locator('.match-card').first.wait_for(timeout=5000)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'page overflow at {width}'
        assert page.locator('.match-card').count()==2
        assert not page.locator('#hero').is_visible()
        assert not page.locator('[data-act=edit]').first.is_visible()
        for slot in page.locator('.match-player').all():
            box=slot.bounding_box();assert box['height']>=44 and box['width']>=90, (width,box)
        assert page.locator('.match-card').first.bounding_box()['height']<310, width
        assert page.locator('.match-player.vacant:not(:disabled)').count()==3
        if width<=600:
            assert not page.locator('#match-form').is_visible()
            assert not page.locator('#hero').is_visible()
            assert page.locator('.match-player.vacant').first.bounding_box()['width']>=90
            assert page.locator('.match-actions button').first.bounding_box()['height']>=44
            page.locator('#toggle-match-form').click();assert page.locator('#match-form').is_visible()
            assert page.locator('#match-location').bounding_box()['width']>=120
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('#toggle-match-form').click();assert not page.locator('#match-form').is_visible()
            page.locator('.match-options summary').first.click();page.locator('[data-act=edit]').first.click();assert page.locator('#match-form').is_visible()
            assert page.locator('#match-form-title').inner_text()=='Edit match'
            page.locator('#cancel-edit').click();assert not page.locator('#match-form').is_visible();page.locator('.match-options summary').first.click()
        else: assert not page.locator('#match-form').is_visible()
        assert page.locator('.court-toggle').count()==1
        assert page.locator('.court-toggle').bounding_box()['height']>=44
        assert page.locator('.court-readonly').inner_text()=='Not booked'
        if width==390:
            page.on('dialog',lambda dialog: dialog.accept())
            page.locator('.court-toggle').click()
            page.wait_for_function("document.querySelector('.court-toggle').getAttribute('aria-pressed')==='true'")
            assert page.locator('.court-toggle').inner_text().strip().endswith('Booked!')
            assert page.evaluate("window.rpcCalls.some(c=>c.fn==='set_padel_court_booked' && c.args.p_booked===true && c.args.p_schedule_revision==='test-revision')")
            page.locator('.court-toggle').click()
            page.wait_for_function("document.querySelector('.court-toggle').getAttribute('aria-pressed')==='false'")
            page.locator('.match-options summary').first.click();assert page.locator('.move-player').first.is_visible()
            page.locator('.move-player').first.select_option('2')
            page.wait_for_function("window.rpcCalls.some(c=>c.fn==='change_padel_match_player' && c.args.p_action==='move' && c.args.p_slot===2)")
            page.locator('[data-act=leave]').first.click()
            page.wait_for_function("window.rpcCalls.some(c=>c.fn==='change_padel_match_player' && c.args.p_action==='leave')")
            page.locator('.match-player.vacant:not(:disabled)').first.click()
            page.wait_for_function("window.rpcCalls.some(c=>c.fn==='change_padel_match_player' && c.args.p_action==='join' && c.args.p_match_id==='match-2')")
            page.locator('#refresh-matches').click();assert page.locator('.match-options').first.get_attribute('open') is not None
            page.locator('.match-options summary').first.click()

        page.close();print(f'PASS: dashboard {width}px',flush=True)
    page=browser.new_page(viewport={'width':320,'height':700});load(page,False);page.locator('#email-form').wait_for();assert page.evaluate('document.documentElement.scrollWidth <= innerWidth');assert page.locator('#auth-email').bounding_box()['height']>=44;assert page.locator('#send-code-button').bounding_box()['height']>=44;print('PASS: login 320px');browser.close()
