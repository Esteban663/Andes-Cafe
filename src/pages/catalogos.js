import { crudPage } from '../crud.js';
import { badge, money, num, dateOnly, esc } from '../ui.js';

const yesNo = (v) => badge(v ? 'Activo' : 'Inactivo', v ? 'ok' : 'neutral');

// ------------------------------------------------------------------ productos
export const renderProductos = crudPage({
  table: 'productos',
  title: 'Productos',
  subtitle: 'Catálogo e inventario. Cada cambio se guarda en Supabase y queda en la tabla de auditoría.',
  select: '*, categorias(nombre), proveedores(nombre)',
  orderBy: 'id',
  columns: [
    { label: 'SKU', get: (r) => r.sku },
    { label: 'Producto', get: (r) => r.nombre },
    { label: 'Categoría', get: (r) => r.categorias?.nombre ?? '' },
    { label: 'Proveedor', get: (r) => r.proveedores?.nombre ?? '—' },
    { label: 'Precio', get: (r) => r.precio_venta, fmt: (v) => money(v) },
    {
      label: 'Stock',
      get: (r) => r.stock,
      fmt: (v, r) => (v === 0 ? badge('Agotado', 'danger') : v <= r.stock_minimo ? badge(`${num(v)} · bajo`, 'warn') : num(v)),
    },
    { label: 'Estado', get: (r) => (r.activo ? 'Activo' : 'Inactivo'), fmt: (_, r) => yesNo(r.activo) },
  ],
  fields: [
    { name: 'sku', label: 'SKU', type: 'text', required: true },
    { name: 'nombre', label: 'Nombre', type: 'text', required: true },
    { name: 'categoria_id', label: 'Categoría', type: 'select', required: true, options: { table: 'categorias', value: 'id', label: 'nombre' } },
    { name: 'proveedor_id', label: 'Proveedor', type: 'select', options: { table: 'proveedores', value: 'id', label: 'nombre' } },
    { name: 'precio_venta', label: 'Precio de venta (COP)', type: 'number', required: true, min: 0, step: 100 },
    { name: 'costo', label: 'Costo (COP)', type: 'number', required: true, min: 0, step: 100 },
    { name: 'stock', label: 'Stock', type: 'number', required: true, min: 0, step: 1, default: 0 },
    { name: 'stock_minimo', label: 'Stock mínimo', type: 'number', required: true, min: 0, step: 1, default: 5 },
    { name: 'activo', label: 'Producto activo', type: 'checkbox' },
  ],
  rowLabel: (r) => `el producto "${r.nombre}"`,
});

// ------------------------------------------------------------------ clientes
export const renderClientes = crudPage({
  table: 'clientes',
  title: 'Clientes',
  subtitle: 'Minoristas, mayoristas y corporativos del Eje Cafetero.',
  select: '*',
  columns: [
    { label: 'Nombre', get: (r) => r.nombre },
    { label: 'Email', get: (r) => r.email ?? '' },
    { label: 'Teléfono', get: (r) => r.telefono ?? '' },
    { label: 'Municipio', get: (r) => r.municipio },
    {
      label: 'Tipo',
      get: (r) => r.tipo,
      fmt: (v) => badge(v, v === 'corporativo' ? 'accent' : v === 'mayorista' ? 'ok' : 'neutral'),
    },
  ],
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'telefono', label: 'Teléfono', type: 'text' },
    { name: 'municipio', label: 'Municipio', type: 'text', required: true },
    {
      name: 'tipo',
      label: 'Tipo de cliente',
      type: 'select',
      required: true,
      default: 'minorista',
      options: [['minorista', 'Minorista'], ['mayorista', 'Mayorista'], ['corporativo', 'Corporativo']],
    },
  ],
  rowLabel: (r) => `al cliente "${r.nombre}"`,
});

// ------------------------------------------------------------------ proveedores
export const renderProveedores = crudPage({
  table: 'proveedores',
  title: 'Proveedores',
  subtitle: 'Fincas, cooperativas y distribuidores que abastecen el inventario.',
  select: '*',
  columns: [
    { label: 'Nombre', get: (r) => r.nombre },
    { label: 'NIT', get: (r) => r.nit ?? '' },
    { label: 'Municipio', get: (r) => r.municipio },
    { label: 'Contacto', get: (r) => r.email ?? '' },
    { label: 'Estado', get: (r) => (r.activo ? 'Activo' : 'Inactivo'), fmt: (_, r) => yesNo(r.activo) },
  ],
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true },
    { name: 'nit', label: 'NIT', type: 'text' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'telefono', label: 'Teléfono', type: 'text' },
    { name: 'municipio', label: 'Municipio', type: 'text', required: true },
    { name: 'activo', label: 'Proveedor activo', type: 'checkbox' },
  ],
  rowLabel: (r) => `al proveedor "${r.nombre}"`,
});

// ------------------------------------------------------------------ compras
export const renderCompras = crudPage({
  table: 'compras',
  title: 'Compras a proveedores',
  subtitle: 'Registro de abastecimiento. Es un libro de compras; el stock se ajusta editando el producto.',
  select: '*, proveedores(nombre), productos(nombre)',
  orderBy: 'fecha',
  desc: true,
  columns: [
    { label: 'Fecha', get: (r) => r.fecha, fmt: (v) => esc(dateOnly(v)) },
    { label: 'Proveedor', get: (r) => r.proveedores?.nombre ?? '' },
    { label: 'Producto', get: (r) => r.productos?.nombre ?? '' },
    { label: 'Cantidad', get: (r) => r.cantidad, fmt: (v) => num(v) },
    { label: 'Costo unit.', get: (r) => r.costo_unitario, fmt: (v) => money(v) },
    { label: 'Total', get: (r) => r.total, fmt: (v) => `<strong>${money(v)}</strong>` },
    {
      label: 'Estado',
      get: (r) => r.estado,
      fmt: (v) => badge(v, v === 'recibida' ? 'ok' : v === 'pedida' ? 'warn' : 'danger'),
    },
  ],
  fields: [
    { name: 'proveedor_id', label: 'Proveedor', type: 'select', required: true, options: { table: 'proveedores', value: 'id', label: 'nombre' } },
    { name: 'producto_id', label: 'Producto', type: 'select', required: true, options: { table: 'productos', value: 'id', label: 'nombre' } },
    { name: 'cantidad', label: 'Cantidad', type: 'number', required: true, min: 1, step: 1 },
    { name: 'costo_unitario', label: 'Costo unitario (COP)', type: 'number', required: true, min: 0, step: 100 },
    { name: 'fecha', label: 'Fecha', type: 'date', required: true, default: new Date().toISOString().slice(0, 10) },
    {
      name: 'estado',
      label: 'Estado',
      type: 'select',
      required: true,
      default: 'recibida',
      options: [['recibida', 'Recibida'], ['pedida', 'Pedida'], ['cancelada', 'Cancelada']],
    },
  ],
  rowLabel: (r) => `la compra #${r.id}`,
});
