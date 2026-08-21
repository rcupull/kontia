export type CategoryIconOption = {
  value: string;
  label: string;
  keywords: string[];
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const icon = (
  label: string,
  value: string,
  keywords = "",
): CategoryIconOption => ({
  label,
  value,
  keywords: normalize(`${label} ${keywords}`).split(" "),
});

export const categoryIcons = [
  icon("Carrito", "🛒", "compras venta mercado"),
  icon("Caja", "📦", "paquete almacen"),
  icon("Tienda", "🏪", "negocio local"),
  icon("Etiqueta", "🏷️", "precio oferta"),
  icon("Factura", "🧾", "recibo ticket"),
  icon("Dinero", "💰", "efectivo pago"),
  icon("Tarjeta", "💳", "transferencia pago"),
  icon("Estrella", "⭐", "destacado"),
  icon("Regalo", "🎁", "promocion oferta"),
  icon("Fuego", "🔥", "popular caliente"),
  icon("Refresco", "🥤", "bebida soda"),
  icon("Jugo", "🧃", "bebida zumo"),
  icon("Café", "☕", "bebida caliente"),
  icon("Leche", "🥛", "lacteo bebida"),
  icon("Agua", "💧", "bebida"),
  icon("Cerveza", "🍺", "alcohol bebida"),
  icon("Vino", "🍷", "alcohol bebida"),
  icon("Hielo", "🧊", "frio congelado"),
  icon("Hamburguesa", "🍔", "comida rapida"),
  icon("Pizza", "🍕", "comida"),
  icon("Pollo", "🍗", "carne comida"),
  icon("Carne", "🥩", "proteina comida"),
  icon("Pan", "🍞", "panaderia"),
  icon("Queso", "🧀", "lacteo"),
  icon("Huevo", "🥚", "alimento"),
  icon("Enlatados", "🥫", "conservas lata"),
  icon("Granos", "🫘", "frijoles legumbres"),
  icon("Arroz", "🍚", "grano cereal"),
  icon("Condimentos", "🧂", "sal especias"),
  icon("Frutas", "🍎", "manzana fruta"),
  icon("Vegetales", "🥬", "verdura ensalada"),
  icon("Dulces", "🍬", "caramelo"),
  icon("Galletas", "🍪", "dulce"),
  icon("Helado", "🍦", "postre frio"),
  icon("Limpieza", "🧼", "jabon higiene"),
  icon("Hogar", "🏠", "casa"),
  icon("Salud", "💊", "medicina farmacia"),
  icon("Bebé", "👶", "infantil"),
  icon("Mascotas", "🐾", "perro gato"),
  icon("Tecnología", "💻", "computadora"),
  icon("Teléfono", "📱", "celular"),
  icon("Oficina", "📝", "papeleria"),
  icon("Ropa", "👕", "vestuario"),
  icon("Calzado", "👟", "zapatos"),
  icon("Ferretería", "🔨", "herramientas"),
  icon("Vehículos", "🚗", "auto carro"),
  icon("Electricidad", "⚡", "energia"),
  icon("Otros", "✨", "varios"),
];

export function filterCategoryIcons(
  search: string,
  option: CategoryIconOption,
) {
  const value = normalize(search.trim());
  return (
    !value ||
    option.value.includes(value) ||
    option.keywords.some((keyword) => keyword.includes(value))
  );
}
