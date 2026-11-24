-- Padel Connect database schema
-- Run the complete file in Supabase Dashboard -> SQL Editor.
-- Enable Anonymous Sign-Ins in Authentication -> Providers before using the app.

create extension if not exists pgcrypto;

create table if not exists public.padel_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 50),
  invite_code text not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.padel_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.padel_groups(id) on delete cascade,
  user_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  unique(group_id,user_id)
);

create table if not exists public.padel_clubs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.padel_groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  area text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(group_id,name)
);

create table if not exists public.padel_availability (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.padel_groups(id) on delete cascade,
  member_id uuid not null references public.padel_members(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  period text not null check (period ~ '^(60|90)_(17|18|19|20|21|22):(00|15|30|45)$'),
  club_id uuid references public.padel_clubs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(member_id,weekday,period,club_id)
);

create index if not exists padel_members_group_idx on public.padel_members(group_id);
create index if not exists padel_availability_group_idx on public.padel_availability(group_id);
create index if not exists padel_clubs_group_idx on public.padel_clubs(group_id);

alter table public.padel_groups enable row level security;
alter table public.padel_members enable row level security;
alter table public.padel_clubs enable row level security;
alter table public.padel_availability enable row level security;

-- No direct access for anonymous visitors. Authenticated group members get SELECT
-- access only to rows in groups they belong to; writes remain RPC-only.
revoke all on public.padel_groups, public.padel_members, public.padel_clubs, public.padel_availability from anon, authenticated;
grant usage on schema public to anon, authenticated;

create or replace function public.is_padel_group_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.padel_members where group_id=p_group_id and user_id=auth.uid())
$$;
revoke all on function public.is_padel_group_member(uuid) from public;
grant execute on function public.is_padel_group_member(uuid) to authenticated;

drop policy if exists "Members can view group members" on public.padel_members;
create policy "Members can view group members" on public.padel_members
  for select to authenticated using (public.is_padel_group_member(group_id));
drop policy if exists "Members can view group clubs" on public.padel_clubs;
create policy "Members can view group clubs" on public.padel_clubs
  for select to authenticated using (public.is_padel_group_member(group_id));
drop policy if exists "Members can view group availability" on public.padel_availability;
create policy "Members can view group availability" on public.padel_availability
  for select to authenticated using (public.is_padel_group_member(group_id));

grant select on public.padel_members, public.padel_clubs, public.padel_availability to authenticated;

create or replace function public.create_padel_group(p_group_name text,p_display_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_group public.padel_groups; v_member public.padel_members; v_code text;
begin
  if auth.uid() is null then raise exception 'Please sign in and try again'; end if;
  if length(trim(p_group_name)) not between 2 and 50 then raise exception 'Group name must be 2–50 characters'; end if;
  if length(trim(p_display_name)) not between 1 and 40 then raise exception 'Name must be 1–40 characters'; end if;
  v_code := upper(substr(encode(gen_random_bytes(6),'hex'),1,8));
  insert into public.padel_groups(name,invite_code,created_by) values(trim(p_group_name),v_code,auth.uid()) returning * into v_group;
  insert into public.padel_members(group_id,user_id,display_name) values(v_group.id,auth.uid(),trim(p_display_name)) returning * into v_member;
  return jsonb_build_object('group_id',v_group.id,'group_name',v_group.name,'invite_code',v_group.invite_code,'member_id',v_member.id);
end $$;

create or replace function public.join_padel_group(p_invite_code text,p_display_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_group public.padel_groups; v_member public.padel_members;
begin
  if auth.uid() is null then raise exception 'Please sign in and try again'; end if;
  if length(trim(p_display_name)) not between 1 and 40 then raise exception 'Name must be 1–40 characters'; end if;
  select * into v_group from public.padel_groups where invite_code=upper(trim(p_invite_code));
  if not found then raise exception 'Invite code not found'; end if;
  insert into public.padel_members(group_id,user_id,display_name) values(v_group.id,auth.uid(),trim(p_display_name))
    on conflict(group_id,user_id) do update set display_name=excluded.display_name returning * into v_member;
  return jsonb_build_object('group_id',v_group.id,'group_name',v_group.name,'invite_code',v_group.invite_code,'member_id',v_member.id);
end $$;

create or replace function public.get_my_padel_group(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_group public.padel_groups; v_member public.padel_members;
begin
  select * into v_member from public.padel_members where group_id=p_group_id and user_id=auth.uid();
  if not found then raise exception 'You are not a member of this group'; end if;
  select * into v_group from public.padel_groups where id=p_group_id;
  return jsonb_build_object('group_id',v_group.id,'group_name',v_group.name,'invite_code',v_group.invite_code,'member_id',v_member.id,'display_name',v_member.display_name,'is_admin',(v_group.created_by=auth.uid()));
end $$;

create or replace function public.remove_padel_group_member(p_group_id uuid,p_member_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid; v_target_user uuid; v_target_name text;
begin
  if auth.uid() is null then raise exception 'Please sign in and try again'; end if;
  select created_by into v_owner from public.padel_groups where id=p_group_id;
  if not found then raise exception 'Group not found'; end if;
  if v_owner is distinct from auth.uid() then raise exception 'Only the person who created this group can remove members'; end if;
  select user_id,display_name into v_target_user,v_target_name from public.padel_members where id=p_member_id and group_id=p_group_id;
  if not found then raise exception 'This member is no longer in the group'; end if;
  if v_target_user=v_owner then raise exception 'The group admin cannot be removed'; end if;
  delete from public.padel_members where id=p_member_id and group_id=p_group_id;
  return jsonb_build_object('removed',true,'member_id',p_member_id,'display_name',v_target_name);
end $$;

create or replace function public.get_padel_dashboard(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  if not exists(select 1 from public.padel_members where group_id=p_group_id and user_id=auth.uid()) then
    raise exception 'You are not a member of this group';
  end if;
  select jsonb_build_object(
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'display_name',m.display_name) order by m.joined_at) from public.padel_members m where m.group_id=p_group_id),'[]'::jsonb),
    'clubs',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'area',c.area) order by c.name) from public.padel_clubs c where c.group_id=p_group_id),'[]'::jsonb),
    'availability',coalesce((select jsonb_agg(jsonb_build_object('member_id',a.member_id,'weekday',a.weekday,'period',a.period,'club_id',a.club_id)) from public.padel_availability a where a.group_id=p_group_id),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.save_padel_availability(p_group_id uuid,p_slots jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_member public.padel_members; v_slot jsonb; v_day int; v_period text; v_club uuid; v_count int:=0;
begin
  select * into v_member from public.padel_members where group_id=p_group_id and user_id=auth.uid();
  if not found then raise exception 'You are not a member of this group'; end if;
  if jsonb_typeof(p_slots) <> 'array' then raise exception 'Availability must be a list'; end if;
  delete from public.padel_availability where group_id=p_group_id and member_id=v_member.id;
  for v_slot in select * from jsonb_array_elements(p_slots) loop
    v_day := (v_slot->>'weekday')::int; v_period := v_slot->>'period'; v_club := nullif(v_slot->>'club_id','')::uuid;
    if v_day not between 0 and 6 or v_period !~ '^(60|90)_(17|18|19|20|21|22):(00|15|30|45)$' then raise exception 'Invalid availability slot'; end if;
    if v_club is not null and not exists(select 1 from public.padel_clubs where id=v_club and group_id=p_group_id) then raise exception 'Invalid club for this group'; end if;
    insert into public.padel_availability(group_id,member_id,weekday,period,club_id) values(p_group_id,v_member.id,v_day,v_period,v_club)
    on conflict do nothing;
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('saved',true,'slots',v_count);
end $$;

create or replace function public.add_padel_club(p_group_id uuid,p_name text,p_area text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_club public.padel_clubs;
begin
  if not exists(select 1 from public.padel_members where group_id=p_group_id and user_id=auth.uid()) then raise exception 'You are not a member of this group'; end if;
  if length(trim(p_name)) not between 2 and 80 then raise exception 'Club name must be 2–80 characters'; end if;
  insert into public.padel_clubs(group_id,name,area,created_by) values(p_group_id,trim(p_name),nullif(trim(p_area),''),auth.uid())
    on conflict(group_id,name) do update set area=excluded.area returning * into v_club;
  return jsonb_build_object('id',v_club.id,'name',v_club.name,'area',v_club.area);
end $$;

revoke all on function public.create_padel_group(text,text) from public;
revoke all on function public.join_padel_group(text,text) from public;
revoke all on function public.get_my_padel_group(uuid) from public;
revoke all on function public.remove_padel_group_member(uuid,uuid) from public;
revoke all on function public.get_padel_dashboard(uuid) from public;
revoke all on function public.save_padel_availability(uuid,jsonb) from public;
revoke all on function public.add_padel_club(uuid,text,text) from public;

grant execute on function public.create_padel_group(text,text) to authenticated;
grant execute on function public.join_padel_group(text,text) to authenticated;
grant execute on function public.get_my_padel_group(uuid) to authenticated;
grant execute on function public.remove_padel_group_member(uuid,uuid) to authenticated;
grant execute on function public.get_padel_dashboard(uuid) to authenticated;
grant execute on function public.save_padel_availability(uuid,jsonb) to authenticated;
grant execute on function public.add_padel_club(uuid,text,text) to authenticated;

-- Realtime: enable these tables in Database -> Publications -> supabase_realtime.
-- Add padel_members, padel_availability and padel_clubs to the publication.
