alter table if exists users
  drop constraint if exists users_role_check;

alter table if exists users
  add constraint users_role_check check (role in ('customer', 'admin', 'user'));
