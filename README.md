# Calculadora de Combos

PWA con cinco secciones: **Combo** (armar y calcular), **Historial** (combos guardados), **Remesas** (control de dinero por Zelle), **Compra/Venta** (trading de USD) y **Combo posible** (planificador de precios).

Con [Supabase configurado](#cuentas-y-permisos) cada persona entra con su cuenta, sus datos la siguen de un teléfono a otro y el administrador decide qué secciones ve cada quien. Sin configurar, la app funciona igual que siempre: local, sin cuentas y sin internet.

## Combo

1. **Declara la tasa** — cuántos CUP vale 1 USD.
2. **Pegar lista** — pega el mensaje de WhatsApp tal cual llegó. La app lo analiza y te muestra una vista previa editable antes de agregar nada.
3. **Verifica** — corrige cantidades, marca ✓ cada producto revisado. El contador te dice cuántos faltan y cuáles no tienen precio.
4. **Costo por unidad** — el botoncito `CUP`/`USD` de cada fila dice en qué moneda compraste ese producto. Lo que compras en dólares no pasa por la tasa; lo que compras en pesos se convierte con ella.
5. **Venta en USD** por unidad → la app multiplica por la cantidad.
6. **Ganancia** = venta total en USD − costo total en USD.

## Historial

Ponle nombre al combo y pulsa **Guardar combo**. Queda archivado con fecha, hora, la tasa que usaste, los productos y la ganancia que dio. Desde el historial puedes **abrirlo** de nuevo (vuelve a la mesa de trabajo), **duplicarlo**, sacar su **CSV** o **borrarlo**.

Si abres un combo guardado y vuelves a pulsar Guardar, se **actualiza** ese mismo — no se duplica. Para partir de una copia, usa *Duplicar*.

## Remesas

Registra el recorrido completo del dinero:

```
Zelle recibido  →  efectivo USD en mano  →  entregado (USD o CUP)
     $100                   $95                    $90
```

- Si no anotas el efectivo, se asume igual al Zelle.
- **O calcula el efectivo con un %**: pon 100 en Zelle y 2 en el campo de descuento, y Efectivo se llena solo con 98. Sigue siendo editable después — si lo tocas a mano, ya no se recalcula solo hasta que vuelvas a cambiar el Zelle o el %.
- Al entregar en CUP puedes fijar una **tasa propia de esa remesa** (distinta de la global).
- **Ganancia = efectivo en mano − entregado.** La diferencia entre el Zelle y el efectivo se muestra aparte, como el costo de sacar el dinero.
- Cada remesa lleva cliente, destinatario, teléfono, nota y estado **pendiente/pagada**.

Arriba tienes las estadísticas: ganancia total, ganancia del mes, cuánto te falta por entregar y volumen movido, más un desglose mes a mes. La pestaña muestra un contador naranja con las remesas pendientes.

## Compra/Venta de USD

Trading simple: compras dólares a una tasa y los vendes a otra.

- **Monto comprado** (USD) + **tasa de compra** (CUP por USD) = tu costo en CUP.
- Cuando los vendes, pones la **tasa de venta** y la ganancia sale sola: `monto × (tasa venta − tasa compra)`.
- Mientras no la marques vendida, queda **pendiente** — las estadísticas muestran cuánto capital tienes invertido esperando.
- Mismo patrón que Remesas: filtros, mes a mes, CSV y resumen para copiar.

## Combo posible

Un planificador de precios, no una lista de compra real — no se guarda con nombre ni tiene historial, es un solo borrador que se recuerda entre visitas, como una calculadora de bolsillo.

Añades productos con su costo (CUP o USD), pones el **margen que quieres ganar** (ej. 40%) y la tasa del USD para ese cálculo — puede ser distinta de la tasa real, para probar "qué pasaría si". La app te dice a cuánto vender cada uno para lograr ese margen.

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
- **Copiar resumen** — texto listo para mandar por WhatsApp (hay uno para el combo y otro para las remesas).
- **CSV** — se abre en Excel (separador `;`, decimales con coma).
- Todo se guarda solo en el dispositivo (`localStorage`) y, si hay cuenta, se copia a tu espacio en Supabase.
- Funciona sin internet una vez abierta: entra con la última sesión y sube lo pendiente cuando vuelve la señal.

## Cuentas y permisos

Opcional. Sin configurar nada, la app sigue siendo local y sin cuentas.

### Montarlo (una vez)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor** → pega el contenido de `supabase.sql` entero → *Run*.
3. **Settings → API** → copia *Project URL* y la clave **anon / public** en `js/config.js`.
4. Sube `CACHE = 'combos-vN'` en `sw.js` y publica.

La clave anon es pública por diseño y puede ir en el repositorio: lo que protege los datos son las reglas RLS, no el secreto de la clave. La que **nunca** debe aparecer ahí es la `service_role`.

### Cómo funciona

- **El primero que se registra queda como administrador.** No hay que coronar a nadie a mano desde la consola de Supabase. Del segundo en adelante entran como usuarios normales, viendo solo Combo, Historial y Combo posible.
- El admin abre **⋯ → Usuarios y permisos** y marca qué secciones ve cada persona. Se guarda al momento. También puede hacer admin a alguien, o desactivar una cuenta para que no entre.
- Nadie puede quitarse ni darse permisos a sí mismo, y la base no deja que te quedes sin ningún administrador.
- **Los datos son de cada quien.** Cada usuario ve solo los suyos, en cualquier teléfono donde entre. El admin puede consultar los de los demás desde Supabase, pero no escribirlos.
- El puntito verde de la barra dice que todo está subido; en naranja, que hay cambios esperando a que vuelva internet.

Esconder pestañas es orden, no cerradura: lo que de verdad impide que alguien lea datos ajenos son las reglas RLS de `supabase.sql`, que se aplican en el servidor aunque el usuario trastee la consola del navegador.

### Si ya venías usando la app sin cuenta

Los combos y remesas que ya tenías en el teléfono se los queda la primera cuenta que entre en ese dispositivo, y se suben a la nube solos. No hay que exportar ni importar nada.

## Instalar en el teléfono

Abre la web en Chrome → menú ⋮ → **Añadir a pantalla de inicio**. En iPhone: Safari → Compartir → **Añadir a pantalla de inicio**.

## Correr en local

Cualquier servidor estático sirve; el service worker necesita `http://` (no `file://`):

```bash
npx http-server -p 5188 -c-1 .
```

## Desarrollo

Sin dependencias ni build: HTML, CSS y módulos ES nativos.

- `index.html` — estructura, pestañas y diálogos
- `styles.css` — tema claro/oscuro, tabla en escritorio y tarjetas en móvil
- `js/core.js` — estado, formato de números, fechas, guardado y migración
- `js/parser.js` — analizador de listas de WhatsApp
- `js/combo.js` — tabla, cálculos, importar y exportar
- `js/historial.js` — combos guardados
- `js/remesas.js` — remesas y estadísticas
- `js/trading.js` — compra/venta de USD
- `js/planner.js` — combo posible (planificador de precios)
- `js/app.js` — navegación, permisos de pestañas y arranque
- `js/config.js` — URL y clave de Supabase (vacío = modo local)
- `js/auth.js` — sesión, permisos y sincronización con la nube
- `js/admin.js` — panel de usuarios y permisos
- `js/vendor/supabase.js` — cliente de Supabase, guardado aquí para que la app abra sin internet
- `supabase.sql` — tablas y reglas de acceso, para pegar en Supabase
- `sw.js` — caché offline. **Sube `CACHE = 'combos-vN'` en cada cambio** para que los teléfonos ya instalados reciban la actualización.

Los datos viven en `localStorage` bajo `calccombos.v2` — y, cuando hay cuenta, bajo `calccombos.v2.<id de usuario>`, para que dos personas que compartan teléfono no se pisen. Al arrancar, si solo existe `calccombos.v1` (la versión de un solo combo suelto), se migra sola y el costo de cada producto se marca como CUP.

Para probar desde la consola del navegador:

```js
__calc.parseList('10 lbs d arroz\n2 laticas d tomate')
__calc.calcRemesa({zelle:100, efectivo:95, entregado:90, entregadoCur:'USD', tasa:0})
```

Los permisos y la elección de copia (teléfono contra nube) tienen su comprobación aparte:

```bash
node test-permisos.mjs
```
