create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  street text not null,
  unit text not null default '',
  city text not null default 'Austin',
  state text not null default 'TX',
  postal_code text not null,
  delivery_instructions text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint delivery_addresses_austin check (
    lower(city) = 'austin' and upper(state) = 'tx'
  )
);

create unique index if not exists delivery_addresses_one_default_per_user
  on public.delivery_addresses (user_id)
  where is_default;

create table if not exists public.menu_items (
  id integer primary key,
  name text not null,
  description text not null,
  price numeric(8, 2) not null check (price >= 0),
  image_url text not null,
  active boolean not null default true
);

insert into public.menu_items (id, name, description, price, image_url)
values
  (1, 'Original Brick Smash', 'A 90g smash patty cooked on the brick oven, topped with American cheese, house-made pickles, and smoked onion sauce on a butter-toasted brioche bun.', 11.50, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/original_brick_smash.jpg'),
  (2, 'Double Oak Smash', 'Two 90g smash patties with double cheddar, crispy smoked bacon, and house-made BBQ glaze.', 15.00, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/oak_double_smash.jpg'),
  (3, 'Triple-Cooked Fries', 'Potatoes cut daily, triple-fried in beef tallow, and seasoned with smoked sea salt.', 5.00, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/triple_cooked_fries.jpg'),
  (4, 'Austin Craft Lime Soda', 'House-made lime soda with sparkling water and cane sugar.', 3.50, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/austin_craft_lime_soda.jpg'),
  (5, 'Smokehouse Jalapeño Smash', 'A 90g smash patty with pepper jack, jalapeños, toasted onions, and house-made creamy sauce on brioche.', 13.50, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/smokehouse_jalapeno_smash.jpg'),
  (6, 'Texas Onion Smash', 'A 90g smash patty topped with grilled onions, American cheddar, and lightly smoked barbecue sauce.', 13.00, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/texas_onion_smash.jpg'),
  (7, 'Crispy Chicken Sandwich', 'Crispy chicken with fresh lettuce, pickles, and ranch on toasted bread.', 12.50, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/crispy_chicken_sandwich.jpg'),
  (8, 'Hill Country Grilled Melt', 'A grilled sandwich with melted cheese and butter-toasted bread.', 10.50, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/hill_country_grilled_melt.jpg'),
  (9, 'Smoky BBQ Wings', 'Oven-roasted chicken wings tossed in house-made barbecue sauce.', 10.00, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/smoky_bbq_wings.jpg'),
  (10, 'Smokehouse BBQ Ribs', 'Slow-smoked ribs finished with house-made barbecue sauce.', 16.00, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/smokehouse_bbq_ribs.jpg'),
  (11, 'Vanilla Cookie Shake', 'A creamy vanilla shake with chocolate cookie pieces.', 6.50, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/vanilla_cookie_shake.jpg'),
  (12, 'Texas Chocolate Brownie', 'A rich chocolate brownie with a soft center and cocoa topping.', 5.50, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/texas_chocolate_brownie.jpg'),
  (13, 'Caramel Ice Cream Sundae', 'Creamy vanilla ice cream finished with caramel sauce.', 5.00, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/caramel_ice_cream_sundae.jpg'),
  (14, 'Hill Country Chop Salad', 'Crisp lettuce, tomato, cucumber, and ranch dressing served on the side.', 8.50, 'https://brickandbun-domingos-cameme.vercel.app/assets/food/hill_country_chop_salad.jpg')
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    image_url = excluded.image_url,
    active = true;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  address_id uuid references public.delivery_addresses (id) on delete set null,
  address_snapshot jsonb not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null default '',
  status text not null default 'received'
    check (status in ('received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled')),
  customer_note text not null default '',
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  payment_status text not null default 'not_required',
  stripe_checkout_session_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists payment_status text;
update public.orders
set payment_status = 'not_required'
where payment_status is null;
alter table public.orders
  alter column payment_status set default 'not_required',
  alter column payment_status set not null,
  add column if not exists stripe_checkout_session_id text;
alter table public.orders
  drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending_payment', 'received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'));
alter table public.orders
  drop constraint if exists orders_payment_status_check;
alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'refunded'));
create unique index if not exists orders_stripe_checkout_session
  on public.orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists orders_user_created_at
  on public.orders (user_id, created_at desc);

create index if not exists orders_status_created_at
  on public.orders (status, created_at desc);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id integer references public.menu_items (id) on delete set null,
  item_name text not null,
  unit_price numeric(8, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 25),
  line_total numeric(10, 2) generated always as (unit_price * quantity) stored
);

create table if not exists public.newsletter_subscribers (
  email text primary key,
  user_id uuid references auth.users (id) on delete set null,
  subscribed_at timestamptz not null default now(),
  active boolean not null default true
);

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint in_app_notifications_title_length check (length(title) between 1 and 120),
  constraint in_app_notifications_message_length check (length(message) between 1 and 2000)
);

create index if not exists in_app_notifications_user_created_at
  on public.in_app_notifications (user_id, created_at desc);

create or replace function public.is_order_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false);
$$;

create or replace function public.get_admin_notification_recipients()
returns table (user_id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_order_admin() then
    raise exception 'Admin access is required.';
  end if;

  return query
  select users.id,
         coalesce(nullif(trim(profiles.full_name), ''), 'Customer'),
         users.email::text
  from auth.users as users
  left join public.profiles as profiles on profiles.id = users.id
  order by coalesce(nullif(trim(profiles.full_name), ''), users.email, 'Customer');
end;
$$;

create or replace function public.send_in_app_notification(
  p_recipient_id uuid,
  p_title text,
  p_message text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid := auth.uid();
  v_recipient_count integer;
  v_title text := trim(p_title);
  v_message text := trim(p_message);
begin
  if not public.is_order_admin() then
    raise exception 'Admin access is required.';
  end if;

  if v_title is null or length(v_title) not between 1 and 120 then
    raise exception 'The notification title must be between 1 and 120 characters.';
  end if;

  if v_message is null or length(v_message) not between 1 and 2000 then
    raise exception 'The notification message must be between 1 and 2000 characters.';
  end if;

  if p_recipient_id is null then
    insert into public.in_app_notifications (user_id, sender_id, title, message)
    select users.id, v_sender_id, v_title, v_message
    from auth.users as users;
    get diagnostics v_recipient_count = row_count;
  else
    if not exists (select 1 from auth.users where id = p_recipient_id) then
      raise exception 'Notification recipient not found.';
    end if;

    insert into public.in_app_notifications (user_id, sender_id, title, message)
    values (p_recipient_id, v_sender_id, v_title, v_message);
    v_recipient_count := 1;
  end if;

  return v_recipient_count;
end;
$$;

create or replace function public.mark_in_app_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage notifications.';
  end if;

  update public.in_app_notifications
  set read_at = now()
  where id = p_notification_id
    and user_id = auth.uid()
    and read_at is null;

  if not found and not exists (
    select 1
    from public.in_app_notifications
    where id = p_notification_id
      and user_id = auth.uid()
      and read_at is not null
  ) then
    raise exception 'Notification not found.';
  end if;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.phone, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.delivery_addresses enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.in_app_notifications enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_order_admin());

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Users manage own delivery addresses" on public.delivery_addresses;
create policy "Users manage own delivery addresses"
  on public.delivery_addresses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Anyone can view active menu items" on public.menu_items;
create policy "Anyone can view active menu items"
  on public.menu_items for select to anon, authenticated
  using (active);

drop policy if exists "Customers and admins read orders" on public.orders;
create policy "Customers and admins read orders"
  on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or public.is_order_admin());

drop policy if exists "Customers and admins read order items" on public.order_items;
create policy "Customers and admins read order items"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1
      from public.orders
      where orders.id = order_items.order_id
        and (orders.user_id = (select auth.uid()) or public.is_order_admin())
    )
  );

drop policy if exists "Anyone can subscribe to newsletter" on public.newsletter_subscribers;
create policy "Anyone can subscribe to newsletter"
  on public.newsletter_subscribers for insert to anon, authenticated
  with check (
    email = lower(trim(email))
    and length(email) between 3 and 254
    and position('@' in email) > 1
  );

drop policy if exists "Users read own in-app notifications" on public.in_app_notifications;
create policy "Users read own in-app notifications"
  on public.in_app_notifications for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.place_order(
  p_address_id uuid,
  p_items jsonb,
  p_customer_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_address public.delivery_addresses%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_menu_item public.menu_items%rowtype;
  v_quantity integer;
  v_subtotal numeric(10, 2) := 0;
  v_item_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Sign in before placing an order.';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Your cart is empty or invalid.';
  end if;

  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Your cart is empty or contains too many different items.';
  end if;

  select *
  into v_address
  from public.delivery_addresses
  where id = p_address_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Choose a valid delivery address from your account.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item -> 'product_id') is distinct from 'number'
      or jsonb_typeof(v_item -> 'quantity') is distinct from 'number'
      or (v_item ->> 'product_id') !~ '^[0-9]+$'
      or (v_item ->> 'quantity') !~ '^[0-9]+$' then
      raise exception 'The cart contains an invalid item.';
    end if;

    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 25 then
      raise exception 'Each item quantity must be between 1 and 25.';
    end if;

    select *
    into v_menu_item
    from public.menu_items
    where id = (v_item ->> 'product_id')::integer
      and active;

    if not found then
      raise exception 'A product in your cart is no longer available.';
    end if;

    v_subtotal := v_subtotal + v_menu_item.price * v_quantity;
    v_item_count := v_item_count + 1;
  end loop;

  if v_item_count <> jsonb_array_length(p_items) then
    raise exception 'The cart contains an invalid item.';
  end if;

  insert into public.orders (
    user_id,
    address_id,
    address_snapshot,
    customer_name,
    customer_email,
    customer_phone,
    customer_note,
    subtotal
  )
  values (
    v_user_id,
    v_address.id,
    jsonb_build_object(
      'label', v_address.label,
      'recipient_name', v_address.recipient_name,
      'street', v_address.street,
      'unit', v_address.unit,
      'city', v_address.city,
      'state', v_address.state,
      'postal_code', v_address.postal_code,
      'delivery_instructions', v_address.delivery_instructions
    ),
    coalesce(
      (select nullif(trim(full_name), '') from public.profiles where id = v_user_id),
      (select nullif(trim(raw_user_meta_data ->> 'full_name'), '') from auth.users where id = v_user_id),
      'Customer'
    ),
    coalesce((select email from auth.users where id = v_user_id), ''),
    coalesce((select phone from public.profiles where id = v_user_id), ''),
    left(coalesce(p_customer_note, ''), 500),
    v_subtotal
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    select * into v_menu_item
    from public.menu_items
    where id = (v_item ->> 'product_id')::integer
      and active;

    insert into public.order_items (
      order_id,
      menu_item_id,
      item_name,
      unit_price,
      quantity
    )
    values (
      v_order_id,
      v_menu_item.id,
      v_menu_item.name,
      v_menu_item.price,
      v_quantity
    );
  end loop;

  return v_order_id;
end;
$$;

create or replace function public.create_pending_order(
  p_address_id uuid,
  p_items jsonb,
  p_customer_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_address public.delivery_addresses%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_menu_item public.menu_items%rowtype;
  v_quantity integer;
  v_product_id integer;
  v_product_ids integer[] := '{}'::integer[];
  v_subtotal numeric(10, 2) := 0;
  v_lines jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Sign in before starting checkout.';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Your cart is empty or invalid.';
  end if;

  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Your cart is empty or contains too many different items.';
  end if;

  select *
  into v_address
  from public.delivery_addresses
  where id = p_address_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Choose a valid delivery address from your account.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item -> 'product_id') is distinct from 'number'
      or jsonb_typeof(v_item -> 'quantity') is distinct from 'number'
      or (v_item ->> 'product_id') !~ '^[0-9]+$'
      or (v_item ->> 'quantity') !~ '^[0-9]+$' then
      raise exception 'The cart contains an invalid item.';
    end if;

    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 25 then
      raise exception 'Each item quantity must be between 1 and 25.';
    end if;

    v_product_id := (v_item ->> 'product_id')::integer;
    if v_product_id = any(v_product_ids) then
      raise exception 'The cart contains a repeated product.';
    end if;
    v_product_ids := array_append(v_product_ids, v_product_id);

    select *
    into v_menu_item
    from public.menu_items
    where id = v_product_id
      and active;

    if not found then
      raise exception 'A product in your cart is no longer available.';
    end if;

    v_subtotal := v_subtotal + v_menu_item.price * v_quantity;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'name', v_menu_item.name,
      'description', v_menu_item.description,
      'quantity', v_quantity,
      'unit_amount', (v_menu_item.price * 100)::integer
    ));
  end loop;

  if v_subtotal <= 0 then
    raise exception 'The order total must be greater than zero.';
  end if;

  insert into public.orders (
    user_id,
    address_id,
    address_snapshot,
    customer_name,
    customer_email,
    customer_phone,
    status,
    customer_note,
    subtotal,
    payment_status
  )
  values (
    v_user_id,
    v_address.id,
    jsonb_build_object(
      'label', v_address.label,
      'recipient_name', v_address.recipient_name,
      'street', v_address.street,
      'unit', v_address.unit,
      'city', v_address.city,
      'state', v_address.state,
      'postal_code', v_address.postal_code,
      'delivery_instructions', v_address.delivery_instructions
    ),
    coalesce(
      (select nullif(trim(full_name), '') from public.profiles where id = v_user_id),
      (select nullif(trim(raw_user_meta_data ->> 'full_name'), '') from auth.users where id = v_user_id),
      'Customer'
    ),
    coalesce((select email from auth.users where id = v_user_id), ''),
    coalesce((select phone from public.profiles where id = v_user_id), ''),
    'pending_payment',
    left(coalesce(p_customer_note, ''), 500),
    v_subtotal,
    'pending'
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    select *
    into v_menu_item
    from public.menu_items
    where id = (v_item ->> 'product_id')::integer
      and active;

    insert into public.order_items (
      order_id,
      menu_item_id,
      item_name,
      unit_price,
      quantity
    )
    values (
      v_order_id,
      v_menu_item.id,
      v_menu_item.name,
      v_menu_item.price,
      v_quantity
    );
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'subtotal', v_subtotal,
    'items', v_lines
  );
end;
$$;

create or replace function public.attach_stripe_checkout_session(
  p_order_id uuid,
  p_session_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_session_id is null or p_session_id !~ '^cs_test_[A-Za-z0-9]+$' then
    raise exception 'A valid checkout session is required.';
  end if;

  update public.orders
  set stripe_checkout_session_id = p_session_id,
      updated_at = now()
  where id = p_order_id
    and user_id = auth.uid()
    and status = 'pending_payment'
    and payment_status = 'pending'
    and stripe_checkout_session_id is null;

  if not found then
    raise exception 'The pending order could not be linked to its checkout session.';
  end if;
end;
$$;

create or replace function public.fail_pending_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders
  set status = 'cancelled',
      payment_status = 'failed',
      updated_at = now()
  where id = p_order_id
    and user_id = auth.uid()
    and status = 'pending_payment'
    and payment_status = 'pending'
    and stripe_checkout_session_id is null;
end;
$$;

create or replace function public.update_order_status(
  p_order_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_order_admin() then
    raise exception 'Admin access is required.';
  end if;

  if p_status not in ('confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled') then
    raise exception 'Invalid order status.';
  end if;

  update public.orders
  set status = p_status,
      updated_at = now()
  where id = p_order_id
    and payment_status <> 'pending';

  if not found then
    raise exception 'Order not found.';
  end if;
end;
$$;

create or replace function public.set_default_delivery_address(p_address_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sign in to manage delivery addresses.';
  end if;

  if not exists (
    select 1
    from public.delivery_addresses
    where id = p_address_id
      and user_id = v_user_id
  ) then
    raise exception 'Delivery address not found.';
  end if;

  update public.delivery_addresses
  set is_default = false
  where user_id = v_user_id
    and is_default;

  update public.delivery_addresses
  set is_default = true
  where id = p_address_id
    and user_id = v_user_id;
end;
$$;

create or replace function public.cancel_customer_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to cancel an order.';
  end if;

  update public.orders
  set status = 'cancelled',
      updated_at = now()
  where id = p_order_id
    and user_id = auth.uid()
    and status = 'received';

  if not found then
    raise exception 'This order can no longer be canceled. Contact the restaurant for help.';
  end if;
end;
$$;

create or replace function public.subscribe_newsletter(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if length(v_email) not between 3 and 254
    or position('@' in v_email) < 2
    or position('.' in split_part(v_email, '@', 2)) < 2 then
    raise exception 'Enter a valid email address.';
  end if;

  insert into public.newsletter_subscribers as current_subscription (email, user_id)
  values (v_email, auth.uid())
  on conflict (email) do update
  set active = true,
      subscribed_at = now(),
      user_id = coalesce(current_subscription.user_id, excluded.user_id);
end;
$$;

revoke all on function public.place_order(uuid, jsonb, text) from public, anon;
revoke all on function public.place_order(uuid, jsonb, text) from authenticated;

revoke all on function public.create_pending_order(uuid, jsonb, text) from public, anon;
grant execute on function public.create_pending_order(uuid, jsonb, text) to authenticated;

revoke all on function public.attach_stripe_checkout_session(uuid, text) from public, anon;
grant execute on function public.attach_stripe_checkout_session(uuid, text) to authenticated;

revoke all on function public.fail_pending_order(uuid) from public, anon;
grant execute on function public.fail_pending_order(uuid) to authenticated;

revoke all on function public.update_order_status(uuid, text) from public, anon, authenticated;
grant execute on function public.update_order_status(uuid, text) to authenticated;

revoke all on function public.set_default_delivery_address(uuid) from public, anon;
grant execute on function public.set_default_delivery_address(uuid) to authenticated;

revoke all on function public.cancel_customer_order(uuid) from public, anon;
grant execute on function public.cancel_customer_order(uuid) to authenticated;

revoke all on function public.subscribe_newsletter(text) from public;
grant execute on function public.subscribe_newsletter(text) to anon, authenticated;

revoke all on function public.get_admin_notification_recipients() from public, anon, authenticated;
grant execute on function public.get_admin_notification_recipients() to authenticated;

revoke all on function public.send_in_app_notification(uuid, text, text) from public, anon, authenticated;
grant execute on function public.send_in_app_notification(uuid, text, text) to authenticated;

revoke all on function public.mark_in_app_notification_read(uuid) from public, anon;
grant execute on function public.mark_in_app_notification_read(uuid) to authenticated;

grant select on public.menu_items to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.delivery_addresses to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant select on public.in_app_notifications to authenticated;