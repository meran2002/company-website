-- ئەم SQLـە لە Supabase → SQL Editor جێبەجێ بکە

create table purchase_requests (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text default '',
  quantity integer default 1,
  contact text default '',
  status text default 'pending' check (status in ('pending', 'purchased')),
  created_at timestamptz default now()
);

alter table purchase_requests enable row level security;

create policy "هەموو کەس دەتوانێت ببینێت"
  on purchase_requests for select using (true);

create policy "هەموو کەس دەتوانێت زیاد بکات"
  on purchase_requests for insert with check (true);

create policy "هەموو کەس دەتوانێت نوێ بکاتەوە"
  on purchase_requests for update using (true);
