# Calculadora de Combos

PWA para armar combos de alimentos: pega la lista que te reenvían por WhatsApp, la app la separa en cantidad + unidad + producto, tú verificas, pones el costo en CUP y el precio de venta en USD, y ves la ganancia al instante.

## Cómo funciona

1. **Declara la tasa** — cuántos CUP vale 1 USD.
2. **Pegar lista** — pega el mensaje tal cual llegó. La app lo analiza y te muestra una vista previa editable antes de agregar nada.
3. **Verifica** — corrige cantidades, marca ✓ cada producto revisado. El contador te dice cuántos faltan y cuáles no tienen precio.
4. **Costo en CUP** por unidad → la app lo convierte a USD con tu tasa.
5. **Venta en USD** por unidad → la app multiplica por la cantidad.
6. **Ganancia** = venta total en USD − costo total convertido a USD.

## Lo que entiende el analizador

| Escrito así | Lo lee como |
|---|---|
| `10 lbs d arroz` | 10 · lb · Arroz |
| `3 lbs d f negro` | 3 · lb · Frijol negro |
| `2 laticas d tomate` | 2 · lata · Tomate |
| `1 pqt d galleta d soda` | 1 · paquete · Galleta de soda |
| `15 huevos` | 15 · u · Huevos |
| `arroz 10 lbs` | 10 · lb · Arroz |
| `1/2 lb d cafe` | 0,5 · lb · Cafe |
| `media docena d huevos` | 6 · u · Huevos |
| `tres latas d atun` | 3 · lata · Atun |
| `5kg harina` | 5 · kg · Harina |

También limpia numeración (`1)`, `2.`), viñetas y las marcas de exportación de WhatsApp (`[12/3/25, 10:04] Yuli:`), y descarta saludos y frases sueltas (los deja desmarcados en la vista previa, por si acaso).

Si un producto ya está en la tabla, al importarlo otra vez **suma la cantidad** en vez de duplicar la fila.

## Otras cosas

- **Combos a armar** — si compraste para varios combos iguales, pon el número y verás costo, venta y ganancia por combo.
- **Ver solo pendientes** — esconde lo ya verificado.
- **Copiar resumen** — texto listo para mandar por WhatsApp.
- **CSV** — se abre en Excel (separador `;`, decimales con coma).
- Todo se guarda solo en el dispositivo (`localStorage`). No hay servidor ni cuentas.
- Funciona sin internet una vez abierta.

## Instalar en el teléfono

Abre la web en Chrome → menú ⋮ → **Añadir a pantalla de inicio**. En iPhone: Safari → Compartir → **Añadir a pantalla de inicio**.

## Correr en local

Cualquier servidor estático sirve; el service worker necesita `http://` (no `file://`):

```bash
npx http-server -p 5188 -c-1 .
```

## Desarrollo

Sin dependencias ni build: HTML, CSS y un `app.js` en JavaScript plano.

- `index.html` — estructura y diálogos
- `styles.css` — tema claro/oscuro, tabla en escritorio y tarjetas en móvil
- `app.js` — analizador, cálculos, render y guardado
- `sw.js` — caché offline. **Sube `CACHE = 'combos-vN'` en cada cambio** para que los teléfonos ya instalados reciban la actualización.

Para probar el analizador desde la consola del navegador:

```js
__calc.parseList('10 lbs d arroz\n2 laticas d tomate')
```
