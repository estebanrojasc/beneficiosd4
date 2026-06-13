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
| `AUTH_SECRET` | Secreto JWT para sesiones |
| `KIOSK_TOKEN` | Clave que ingresas en la tablet en `/validar` |

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
3. Fijar una **tablet** en `/validar` con la clave de kiosko (`KIOSK_TOKEN`).
4. Revisar **asistencia** del día en el mantenedor.

## Protección de datos

- No se almacenan fotografías.
- Se guarda únicamente el **vector de 512 dimensiones** (descriptor facial ArcFace).
- Los descriptores solo se usan para comparar rostros en el dispositivo.
- Si vienes de una versión con descriptores de 128 dimensiones, debes **re-enrolar** a los estudiantes.

## Offline

- Los modelos de IA (`/public/models`) y la app se cachean con **service worker**.
- Los descriptores se guardan en **IndexedDB** al sincronizar.
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
