# WalletScanner — Live Dashboard

Dashboard en tiempo real para monitorizar el escaneo de frases semilla BIP-39 en las redes **Ethereum** y **Solana**.

> Construido con Next.js 16 · Supabase · Vercel · Python

---

## Arquitectura

```
buscar_wallets_mejorado.py  (scanner local)
        |
        | POST /api/wallets   (con x-api-key)
        | POST /api/stats     (progreso)
        v
  Next.js API Routes  →  Supabase (PostgreSQL)
        |
        | GET cada 5s
        v
  Dashboard React  (desplegado en Vercel)
```

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 App Router + React |
| Estilos | CSS custom (dark mode premium) |
| Base de datos | Supabase (PostgreSQL) |
| Hosting | Vercel |
| Scanner | Python 3 + bip_utils + eth_account |

## Funcionalidades del dashboard

- Badge **Live** cuando el scanner está activo
- **5 tarjetas** de estadísticas en tiempo real
- **Barra de progreso** del escaneo (% completado)
- **Tabla** de todas las wallets escaneadas
- **Filtro** "Solo con saldo"
- **Búsqueda** por dirección o frase
- **Links** a Etherscan y Solscan
- **Auto-refresh** cada 5 segundos

## Setup rápido

### 1. Supabase

```bash
# Crea un proyecto en https://supabase.com
# Ejecuta dashboard/supabase_schema.sql en el SQL Editor
```

### 2. Variables de entorno

```bash
cp dashboard/.env.example dashboard/.env.local
# Rellena los valores desde Supabase → Settings → API
```

### 3. Desarrollo local

```bash
cd dashboard
npm install
npm run dev
# http://localhost:3000
```

### 4. Desplegar en Vercel

```bash
npm install -g vercel
cd dashboard
vercel --prod
# Añade las env vars en Vercel Dashboard
```

### 5. Ejecutar el scanner

```powershell
$env:DASHBOARD_URL = "https://tu-proyecto.vercel.app"
$env:SCANNER_API_KEY = "tu_clave_secreta"
python buscar_wallets_mejorado.py
```

## Seguridad

- El archivo `.env.local` **nunca** se sube al repositorio
- La API requiere autenticación mediante `x-api-key`
- Supabase usa Row Level Security (RLS): solo lectura pública, escritura solo desde el backend

## Licencia

MIT
