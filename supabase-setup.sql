-- لە Supabase → SQL Editor جێبەجێ بکە

create table if not exists purchase_requests (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text default '',
  quantity integer default 1,
  contact text default '',
  department text not null,
  media_url text default '',
  media_type text default '',
  media_path text default '',
  status text default 'pending',
  created_at timestamptz default now()
);

-- ئەگەر خشتەکە پێشتر هەبوو، ستوونی department زیاد بکە
alter table purchase_requests add column if not exists department text;
alter table purchase_requests add column if not exists media_url text default '';
alter table purchase_requests add column if not exists media_type text default '';
alter table purchase_requests add column if not exists media_path text default '';

alter table purchase_requests enable row level security;

drop policy if exists "select all" on purchase_requests;
drop policy if exists "insert all" on purchase_requests;
drop policy if exists "update all" on purchase_requests;
drop policy if exists "delete all" on purchase_requests;
drop policy if exists "هەموو کەس دەتوانێت ببینێت" on purchase_requests;
drop policy if exists "هەموو کەس دەتوانێت زیاد بکات" on purchase_requests;
drop policy if exists "هەموو کەس دەتوانێت نوێ بکاتەوە" on purchase_requests;
drop policy if exists "هەموو کەس دەتوانێت بسڕێتەوە" on purchase_requests;

create policy "select all" on purchase_requests for select using (true);
create policy "insert all" on purchase_requests for insert with check (true);
create policy "update all" on purchase_requests for update using (true);
create policy "delete all" on purchase_requests for delete using (true);

insert into storage.buckets (id, name, public)
values ('request-media', 'request-media', true)
on conflict (id) do nothing;

drop policy if exists "Public read request media" on storage.objects;
drop policy if exists "Public upload request media" on storage.objects;
drop policy if exists "Public delete request media" on storage.objects;

create policy "Public read request media"
  on storage.objects for select using (bucket_id = 'request-media');
create policy "Public upload request media"
  on storage.objects for insert with check (bucket_id = 'request-media');
create policy "Public delete request media"
  on storage.objects for delete using (bucket_id = 'request-media');
