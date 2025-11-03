# API 14FLY

Guía rápida para levantar y verificar la API localmente.

## Requisitos
- Node.js 18+ (probado con Node 22)
- npm
- (Opcional) PostgreSQL si vas a probar endpoints que consultan la BD

## Variables de entorno
Crea un archivo `.env` (opcional) si quieres configurar el puerto u opciones de BD:

```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=flydb
JWT_SECRET=supersecreto
```

Si no defines `PORT`, la API usa 3000 por defecto.

## Ejecutar en desarrollo

En PowerShell:

```powershell
cd "C:\UMES\VI SEMESTRE\Progra_web\Actividades\Proyecto-Final\14FLY\14FLY\api"
npm install
npm run dev
```

Deberías ver en la terminal:
- "✅ Conexión a PostgreSQL lista" (se crea el pool, la conexión real ocurre al primer query)
- "✅ API corriendo en puerto 3000"

## Verificar que está corriendo

- Navegador: abre http://localhost:3000/
  - Respuesta esperada: `🛫 API 14FLY en ejecución`

- PowerShell:

```powershell
# Probar que el puerto está escuchando
Test-NetConnection -ComputerName localhost -Port 3000

# Obtener el contenido de la ruta raíz
(Invoke-WebRequest -UseBasicParsing http://localhost:3000/).Content
```

## Rutas principales
- `GET /` -> texto simple confirmando que la API está en ejecución
- `GET /api/seats` -> requiere BD; devuelve asientos
- `POST /api/users/register` -> registro
- `POST /api/users/login` -> login (devuelve JWT)
- `POST /api/reservations` (con Bearer token)
- `GET /api/reservations/me` (con Bearer token)

## Solución de problemas
- El navegador no carga:
  - Asegúrate de usar "localhost" (con "o"): http://localhost:3000/
  - Verifica que la terminal donde corriste `npm run dev` muestra "API corriendo en puerto 3000" y no errores.
  - Prueba el puerto: `Test-NetConnection -ComputerName localhost -Port 3000`
- Error EADDRINUSE (puerto en uso):
  - Cambia el puerto en `.env`, por ejemplo `PORT=3001`, reinicia `npm run dev` y visita http://localhost:3001/
- Error de conexión a BD:
  - Ajusta variables de entorno de PostgreSQL en `.env` y asegúrate de que el servidor de BD esté activo.
- Cambios no se reflejan:
  - Nodemon reinicia automáticamente; si no, presiona `rs` en la consola de nodemon o detén y vuelve a iniciar.

## Producción

```powershell
npm run start
```

Esto levanta `node src/index.js` sin reinicio automático.