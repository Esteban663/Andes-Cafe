-- =====================================================================
-- Andes Café · Esquema relacional (PostgreSQL / Supabase)
-- 10 tablas normalizadas (3FN), integridad referencial, índices,
-- triggers de auditoría, funciones RPC, vistas para Looker Studio y RLS.
--
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run.
-- Es idempotente: se puede volver a ejecutar (borra y recrea todo).
-- =====================================================================

-- ---------- Limpieza (orden inverso a las dependencias) ----------
drop view     if exists vw_ventas_detalle, vw_ventas_resumen, vw_inventario cascade;
drop function if exists registrar_venta(bigint, bigint, bigint, jsonb, text) cascade;
drop function if exists anular_venta(bigint) cascade;
drop function if exists resumen_kpis() cascade;
drop table    if exists auditoria_logs, compras, detalle_venta, ventas, metodos_pago,
                        empleados, clientes, productos, proveedores, categorias cascade;
drop function if exists fn_set_updated_at() cascade;
drop function if exists fn_auditar() cascade;
drop function if exists fn_recalcular_total_venta() cascade;

-- =====================================================================
-- 1. TABLAS
-- =====================================================================

-- 1) Categorías de producto
create table categorias (
  id          bigint generated always as identity primary key,
  nombre      text not null unique,
  descripcion text,
  created_at  timestamptz not null default now()
);

-- 2) Proveedores (fincas / cooperativas / distribuidores)
create table proveedores (
  id         bigint generated always as identity primary key,
  nombre     text not null,
  nit        text unique,
  email      text,
  telefono   text,
  municipio  text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3) Productos
create table productos (
  id            bigint generated always as identity primary key,
  sku           text not null unique,
  nombre        text not null,
  categoria_id  bigint not null
                  references categorias(id) on delete restrict on update cascade,
  proveedor_id  bigint
                  references proveedores(id) on delete set null on update cascade,
  precio_venta  numeric(12,2) not null check (precio_venta >= 0),
  costo         numeric(12,2) not null check (costo >= 0),
  stock         integer not null default 0 check (stock >= 0),
  stock_minimo  integer not null default 5 check (stock_minimo >= 0),
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 4) Clientes
create table clientes (
  id         bigint generated always as identity primary key,
  nombre     text not null,
  email      text unique,
  telefono   text,
  municipio  text not null,
  tipo       text not null default 'minorista'
               check (tipo in ('minorista', 'mayorista', 'corporativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5) Empleados (vendedores)
create table empleados (
  id            bigint generated always as identity primary key,
  nombre        text not null,
  cargo         text not null
                  check (cargo in ('vendedor', 'barista', 'supervisor', 'gerente')),
  email         text unique,
  fecha_ingreso date not null default current_date,
  activo        boolean not null default true
);

-- 6) Métodos de pago
create table metodos_pago (
  id           bigint generated always as identity primary key,
  nombre       text not null unique,
  comision_pct numeric(5,2) not null default 0 check (comision_pct between 0 and 100)
);

-- 7) Ventas (encabezado)
create table ventas (
  id             bigint generated always as identity primary key,
  cliente_id     bigint not null
                   references clientes(id) on delete restrict on update cascade,
  empleado_id    bigint
                   references empleados(id) on delete set null on update cascade,
  metodo_pago_id bigint not null
                   references metodos_pago(id) on delete restrict on update cascade,
  estado         text not null default 'completada'
                   check (estado in ('completada', 'pendiente', 'anulada')),
  total          numeric(14,2) not null default 0 check (total >= 0),
  fecha          timestamptz not null default now(),
  notas          text
);

-- 8) Detalle de venta (líneas)
create table detalle_venta (
  id              bigint generated always as identity primary key,
  venta_id        bigint not null
                    references ventas(id) on delete cascade on update cascade,
  producto_id     bigint not null
                    references productos(id) on delete restrict on update cascade,
  cantidad        integer not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  subtotal        numeric(14,2) generated always as (cantidad * precio_unitario) stored,
  unique (venta_id, producto_id)
);

-- 9) Compras de inventario a proveedores
create table compras (
  id             bigint generated always as identity primary key,
  proveedor_id   bigint not null
                   references proveedores(id) on delete restrict on update cascade,
  producto_id    bigint not null
                   references productos(id) on delete restrict on update cascade,
  cantidad       integer not null check (cantidad > 0),
  costo_unitario numeric(12,2) not null check (costo_unitario >= 0),
  total          numeric(14,2) generated always as (cantidad * costo_unitario) stored,
  fecha          date not null default current_date,
  estado         text not null default 'recibida'
                   check (estado in ('pedida', 'recibida', 'cancelada'))
);

-- 10) Auditoría (quién cambió qué)
create table auditoria_logs (
  id               bigint generated always as identity primary key,
  tabla            text not null,
  operacion        text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  registro_id      text,
  datos_anteriores jsonb,
  datos_nuevos     jsonb,
  -- rol de la petición (anon/authenticated) según PostgREST; si no hay, el usuario de BD
  usuario          text not null default coalesce(
                     nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                     current_user),
  created_at       timestamptz not null default now()
);

-- =====================================================================
-- 2. ÍNDICES (llaves foráneas y columnas de filtrado/analítica)
-- =====================================================================
create index idx_productos_categoria  on productos (categoria_id);
create index idx_productos_proveedor  on productos (proveedor_id);
create index idx_productos_stock_bajo on productos (stock) where activo;
create index idx_clientes_municipio   on clientes (municipio);
create index idx_clientes_tipo        on clientes (tipo);
create index idx_ventas_cliente       on ventas (cliente_id);
create index idx_ventas_empleado      on ventas (empleado_id);
create index idx_ventas_metodo        on ventas (metodo_pago_id);
create index idx_ventas_fecha         on ventas (fecha);
create index idx_ventas_estado        on ventas (estado);
create index idx_detalle_venta        on detalle_venta (venta_id);
create index idx_detalle_producto     on detalle_venta (producto_id);
create index idx_compras_proveedor    on compras (proveedor_id);
create index idx_compras_producto     on compras (producto_id);
create index idx_compras_fecha        on compras (fecha);
create index idx_auditoria_tabla_fecha on auditoria_logs (tabla, created_at desc);

-- =====================================================================
-- 3. FUNCIONES Y TRIGGERS
-- =====================================================================

-- 3.1 updated_at automático
create function fn_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_productos_updated before update on productos
  for each row execute function fn_set_updated_at();
create trigger trg_clientes_updated  before update on clientes
  for each row execute function fn_set_updated_at();

-- 3.2 Auditoría genérica (security definer: escribe aunque RLS bloquee a anon)
create function fn_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_id text;
begin
  if tg_op = 'DELETE' then
    v_id := to_jsonb(old) ->> 'id';
    insert into auditoria_logs (tabla, operacion, registro_id, datos_anteriores)
    values (tg_table_name, tg_op, v_id, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    v_id := to_jsonb(new) ->> 'id';
    insert into auditoria_logs (tabla, operacion, registro_id, datos_anteriores, datos_nuevos)
    values (tg_table_name, tg_op, v_id, to_jsonb(old), to_jsonb(new));
    return new;
  else
    v_id := to_jsonb(new) ->> 'id';
    insert into auditoria_logs (tabla, operacion, registro_id, datos_nuevos)
    values (tg_table_name, tg_op, v_id, to_jsonb(new));
    return new;
  end if;
end $$;

create trigger trg_audit_productos after insert or update or delete on productos
  for each row execute function fn_auditar();
create trigger trg_audit_clientes  after insert or update or delete on clientes
  for each row execute function fn_auditar();

-- 3.3 Mantener ventas.total = suma de sus líneas
create function fn_recalcular_total_venta() returns trigger
language plpgsql as $$
declare
  v_venta bigint := coalesce(new.venta_id, old.venta_id);
begin
  update ventas
     set total = coalesce((select sum(subtotal) from detalle_venta where venta_id = v_venta), 0)
   where id = v_venta;
  return null;
end $$;

create trigger trg_detalle_total after insert or update or delete on detalle_venta
  for each row execute function fn_recalcular_total_venta();

-- 3.4 RPC: registrar una venta completa de forma transaccional
--     p_items = [{"producto_id": 1, "cantidad": 2}, ...]
create function registrar_venta(
  p_cliente_id bigint,
  p_empleado_id bigint,
  p_metodo_pago_id bigint,
  p_items jsonb,
  p_notas text default null
) returns bigint
language plpgsql as $$
declare
  v_venta  bigint;
  v_item   jsonb;
  v_prod   productos%rowtype;
  v_cant   integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe tener al menos un producto';
  end if;

  insert into ventas (cliente_id, empleado_id, metodo_pago_id, estado, notas)
  values (p_cliente_id, p_empleado_id, p_metodo_pago_id, 'completada', p_notas)
  returning id into v_venta;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cant := (v_item ->> 'cantidad')::integer;

    select * into v_prod
      from productos
     where id = (v_item ->> 'producto_id')::bigint
       for update;                                   -- bloquea la fila: evita sobreventa

    if not found then
      raise exception 'Producto % no existe', v_item ->> 'producto_id';
    end if;
    if v_prod.stock < v_cant then
      raise exception 'Stock insuficiente para "%" (disponible: %, pedido: %)',
        v_prod.nombre, v_prod.stock, v_cant;
    end if;

    insert into detalle_venta (venta_id, producto_id, cantidad, precio_unitario)
    values (v_venta, v_prod.id, v_cant, v_prod.precio_venta);

    update productos set stock = stock - v_cant where id = v_prod.id;
  end loop;

  return v_venta;
end $$;

-- 3.5 RPC: anular una venta y devolver el stock
create function anular_venta(p_venta_id bigint) returns void
language plpgsql as $$
declare
  v_estado text;
begin
  select estado into v_estado from ventas where id = p_venta_id for update;
  if not found then
    raise exception 'La venta % no existe', p_venta_id;
  end if;
  if v_estado = 'anulada' then
    raise exception 'La venta % ya estaba anulada', p_venta_id;
  end if;

  update productos p
     set stock = p.stock + d.cantidad
    from detalle_venta d
   where d.venta_id = p_venta_id and d.producto_id = p.id;

  update ventas set estado = 'anulada' where id = p_venta_id;
end $$;

-- 3.6 RPC: KPIs para las tarjetas del Home
create function resumen_kpis() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'ventas_completadas', (select count(*) from ventas where estado = 'completada'),
    'ingresos',           (select coalesce(sum(total), 0) from ventas where estado = 'completada'),
    'ticket_promedio',    (select coalesce(round(avg(total), 0), 0) from ventas where estado = 'completada'),
    'clientes',           (select count(*) from clientes),
    'productos_bajo_stock', (select count(*) from productos where activo and stock <= stock_minimo)
  );
$$;

-- =====================================================================
-- 4. VISTAS PARA ANALÍTICA (fuente de datos de Looker Studio)
-- =====================================================================

-- Una fila por línea de venta, ya "aplanada" con todas las dimensiones
create view vw_ventas_detalle as
select
  d.id                         as detalle_id,
  v.id                         as venta_id,
  v.fecha::date                as fecha,
  v.fecha                      as fecha_hora,
  v.estado,
  c.nombre                     as cliente,
  c.tipo                       as tipo_cliente,
  c.municipio                  as municipio_cliente,
  e.nombre                     as empleado,
  mp.nombre                    as metodo_pago,
  cat.nombre                   as categoria,
  p.nombre                     as producto,
  pr.nombre                    as proveedor,
  d.cantidad,
  d.precio_unitario,
  d.subtotal                   as ingreso,
  (d.cantidad * p.costo)       as costo_total,
  (d.subtotal - d.cantidad * p.costo) as margen
from detalle_venta d
join ventas v          on v.id = d.venta_id
join clientes c        on c.id = v.cliente_id
join metodos_pago mp   on mp.id = v.metodo_pago_id
join productos p       on p.id = d.producto_id
join categorias cat    on cat.id = p.categoria_id
left join empleados e  on e.id = v.empleado_id
left join proveedores pr on pr.id = p.proveedor_id;

-- Una fila por venta
create view vw_ventas_resumen as
select
  v.id as venta_id,
  v.fecha::date as fecha,
  v.estado,
  v.total,
  c.nombre as cliente,
  c.tipo as tipo_cliente,
  c.municipio as municipio_cliente,
  e.nombre as empleado,
  mp.nombre as metodo_pago,
  (select count(*) from detalle_venta d where d.venta_id = v.id) as lineas
from ventas v
join clientes c      on c.id = v.cliente_id
join metodos_pago mp on mp.id = v.metodo_pago_id
left join empleados e on e.id = v.empleado_id;

-- Estado del inventario
create view vw_inventario as
select
  p.id as producto_id, p.sku, p.nombre as producto, cat.nombre as categoria,
  pr.nombre as proveedor, p.stock, p.stock_minimo, p.precio_venta, p.costo,
  (p.stock * p.costo) as valor_inventario,
  case when p.stock = 0 then 'agotado'
       when p.stock <= p.stock_minimo then 'bajo'
       else 'ok' end as nivel_stock
from productos p
join categorias cat on cat.id = p.categoria_id
left join proveedores pr on pr.id = p.proveedor_id
where p.activo;

-- Las vistas analíticas NO se exponen por la API pública (solo Looker las lee)
revoke all on vw_ventas_detalle, vw_ventas_resumen, vw_inventario from anon, authenticated;

-- Permisos explícitos para la API (no dependemos de los privilegios por defecto)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  categorias, proveedores, productos, clientes, empleados,
  metodos_pago, ventas, detalle_venta, compras
  to anon, authenticated;
grant select on auditoria_logs to anon, authenticated;
grant execute on function
  registrar_venta(bigint, bigint, bigint, jsonb, text), anular_venta(bigint), resumen_kpis()
  to anon, authenticated;

-- =====================================================================
-- 5. SEGURIDAD A NIVEL DE FILA (RLS)
--    Modo "demo académico": la app usa la anon key sin login, por lo que
--    se permite CRUD a anon/authenticated. Auditoría es solo lectura.
--    Para producción real: reemplazar por políticas basadas en auth.uid().
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['categorias','proveedores','productos','clientes','empleados',
                           'metodos_pago','ventas','detalle_venta','compras']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      'demo_crud_' || t, t);
  end loop;
end $$;

alter table auditoria_logs enable row level security;
create policy demo_read_auditoria on auditoria_logs
  for select to anon, authenticated using (true);
-- (sin política de INSERT/UPDATE/DELETE: solo los triggers escriben)

-- Pide a la API de Supabase (PostgREST) que recargue el esquema para ver tablas y funciones nuevas
notify pgrst, 'reload schema';
