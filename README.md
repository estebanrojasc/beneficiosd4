# 🍽️ Almuerzo Escolar — Validación facial

Sistema de ingreso al almuerzo escolar con **reconocimiento facial ArcFace/InsightFace** en el navegador (`onnxruntime-web`), mantenedor para docentes, auto-enrolamiento por QR y **modo offline** para tablets en la entrada.

## Características

- **Validación facial continua** en tablet (pantalla verde/rojo)
- **Mantenedor** con usuario y clave: estudiantes, lista de RUTs, QR, asistencia
- **Auto-enrolamiento** vía QR (valida RUT contra listado autorizado)
- **Solo descriptor matemático** de la cara (512 números), **nunca la foto**
- **Desempate asistido** cuando dos estudiantes se parecen mucho (gemelos, mellizos o hermanos)
- **Offline**: descriptores en IndexedDB + cola de asistencia + service worker
- **Ingreso manual** por RUT cuando aún no está enrolado
- Diseño **gamificado**, botones grandes, responsivo para tablet/celular

## Requisitos

- Node.js 18+
- Cuenta **MongoDB Atlas** (conexión `mongodb+srv`)
- Cámara frontal (tablet/celular) con HTTPS en producción

## Instalación

```bash
npm install
cp .env.example .env.local
# Edita .env.local con tu URI de Atlas y claves
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Variables de entorno (`.env.local`)

| Variable | Descripción |
|----------|-------------|
| `MONGODB_URI` | URI de MongoDB Atlas |
| `MONGODB_DB` | Nombre de la base (default: `almuerzo_escolar`) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Acceso al mantenedor |
| `AUTH_SECRET` | Secreto JWT para sesiones (obligatorio y fuerte en producción) |
| `DATA_ENCRYPTION_KEY` | Llave para cifrar el descriptor facial en reposo (estable) |
| `NEXT_PUBLIC_BYPASS_CONSENT` | **Solo pruebas**: `true` omite la autorización del apoderado |

> El acceso del kiosko ya no usa un token global. Cada **programa** tiene su
> propia **clave de validador**, que se genera al crearlo y se escribe en la
> tablet en `/validar`.

## Rutas principales

| Ruta | Uso |
|------|-----|
| `/` | Inicio con accesos grandes |
| `/validar` | **Kiosko** — reconocimiento facial automático |
| `/enrolar` | Formulario público (enlace del QR) |
| `/login` | Ingreso docente |
| `/mantenedor` | Panel de administración |

## Flujo recomendado

1. **Cargar lista de RUTs** autorizados en Mantenedor → *Lista almuerzo* (carga masiva o uno a uno).
2. **Enrolar estudiantes**: desde el mantenedor (captura de cara) o imprimir el **QR** para que se enrolen solos.
3. Fijar una **tablet** en `/validar` con la **clave de validador del programa** (se ve en su configuración).
4. Revisar **asistencia** del día en el mantenedor.

## Protección de datos

- No se almacenan fotografías.
- Se guarda únicamente el **vector de 512 dimensiones** (descriptor facial ArcFace).
- El descriptor se guarda **cifrado en reposo** (AES-256-GCM con `DATA_ENCRYPTION_KEY`).
- La cara es un **dato biométrico de menores**: requiere la **autorización firmada del apoderado** (Ley 21.719), que se registra en el panel. Sin ella, la captura queda bloqueada.
- **Auditoría**: todo acceso, descarga, alta, cambio, borrado o revocación de biometría queda registrado (pestaña _Auditoría_, permiso `auditoria`).
- **Minimización**: `/api/descriptors` entrega solo los descriptores del programa (los miembros), no toda la base, cuando el programa exige lista.
- **Caché del kiosko cifrada**: los descriptores cacheados en IndexedDB se cifran (AES-GCM) con una clave derivada de la clave del validador y caducan a las 24 h.
- **Retención**: en _Ajustes → Retención de biometría_ se configura el borrado automático (fin de año escolar / inactividad). Manual con el botón o programado con `npm run retention:apply` (`--dry-run` para previsualizar).
- **Derechos del titular**: desde la ficha del estudiante se puede **exportar** todos sus datos (acceso/portabilidad); rectificación (editar), supresión (eliminar) y revocación (autorización) ya disponibles.
- **DPO/Responsable**: configurables en _Ajustes → Protección de datos_; aparecen en la política de privacidad y en el documento de autorización.
- **Proveedor (Encargado del Tratamiento)**: si una empresa externa procesa los datos, se declara en `.env` (`PROVEEDOR_NOMBRE`, `PROVEEDOR_CONTACTO`) y el texto lo informa a los apoderados. Si se deja vacío, el texto indica tratamiento 100% interno.
- **Texto legal editable**: con el permiso `textosLegales` (por defecto solo administrador), en _Ajustes_ se puede editar el texto de autorización/privacidad. Al guardar queda fijo; «Restaurar texto automático» vuelve al generado con los datos dinámicos.
- Para cifrar descriptores ya cargados: `npm run encrypt:descriptors` (usa `--dry-run` para previsualizar).
- Si vienes de una versión con descriptores de 128 dimensiones, debes **re-enrolar** a los estudiantes.

## Offline

- Los modelos de IA (`/public/models`) y la app se cachean con **service worker**.
- Los descriptores se guardan en **IndexedDB cifrados** (caducan a las 24 h) al sincronizar.
- Si no hay internet, la asistencia se encola y se sube al volver la conexión.

## Modelos faciales

Ya están incluidos en `public/models/arcface/`:

- `det_500m.onnx`: detector SCRFD-500M con 5 puntos faciales.
- `w600k_mbf.onnx`: MobileFaceNet / MBF@WebFace600K para embeddings ArcFace.

Los binarios WASM de `onnxruntime-web` están en `public/ort/` para funcionar offline.

Si necesitas volver a descargar el pack oficial:

```bash
# Desde la raíz del proyecto (PowerShell)
Invoke-WebRequest -Uri "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip" -OutFile "public/models/arcface/buffalo_sc.zip"
Expand-Archive -Path "public/models/arcface/buffalo_sc.zip" -DestinationPath "public/models/arcface" -Force
Remove-Item "public/models/arcface/buffalo_sc.zip"
```

## Producción

```bash
npm run build
npm start
```

Usa **HTTPS** (Vercel, etc.) para que la cámara funcione en dispositivos móviles.

## Colecciones MongoDB

- `students` — datos del estudiante + descriptor facial
- `allowedRuts` — RUTs autorizados para almorzar
- `attendance` — un documento por día con array de ingresos

## Iconos PWA

Añade `public/icon-192.png` y `public/icon-512.png` para instalar como app en la tablet (opcional).
