# Chewing Kinematics Web

Análisis profesional de cinemática masticatoria en 3D — aplicación web.

## Características

- 📂 Carga de archivos de datos de sensores (.txt)
- 📈 Gráfico 2D interactivo (desplazamiento, velocidad, aceleración)
- 🌐 Gráfico 3D de trayectoria con Plotly
- ⚡ Detección automática de ciclos masticatorios
- 📊 30+ métricas por ciclo (distancias, velocidades, excursiones)
- ⚙ Filtros configurables con perfiles (Adulto/Pediátrico)
- 📋 Tabla de ciclos con datos completos
- 📊 Exportación a Excel (.xlsx)
- 💾 Guardar/Cargar sesiones (JSON)
- ✓ Validación de artefactos

## Tech Stack

- **Frontend:** Vanilla JavaScript + Vite
- **Visualización:** Plotly.js
- **Excel:** SheetJS (xlsx)
- **Procesamiento:** 100% client-side, sin backend

## Desarrollo

```bash
npm install
npm run dev
```

## Despliegue

La app se despliega automáticamente en Vercel desde la rama `main`.
