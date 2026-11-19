# Mi Día 🕘

Organizador de días súper sencillo: **horario con las horas que tú elijas**, **lista del día** y **lista general**.
Lo que no taches pasa solo al día siguiente.

- **Backend:** Python + Flask → `backend/app.py` (guarda todo en `backend/data/planner.json`)
- **Frontend:** Node.js (sin dependencias) → `frontend/server.js` sirve la web y reenvía `/api` al backend

## Arrancar en VS Code (la primera vez)

1. Abre la carpeta `planner-dia` en VS Code y acepta instalar las extensiones recomendadas (Python).
2. `Terminal → Ejecutar tarea… → "1 · Preparar backend"` (crea `.venv` e instala Flask).
3. Pulsa **Ctrl+Shift+P → "Python: Select Interpreter"** y elige el de `.venv`.
4. Ve a *Ejecutar y depurar* (Ctrl+Shift+D), elige **▶ Mi Día (todo)** y pulsa **F5**.
   Se abre solo http://localhost:3000

Las siguientes veces: solo **F5**.

### Sin VS Code (terminal)

```bash
python -m venv .venv
.venv\Scripts\pip install -r backend\requirements.txt      # Windows
# .venv/bin/pip install -r backend/requirements.txt         # Mac / Linux

# terminal 1
.venv\Scripts\python backend\app.py
# terminal 2
node frontend/server.js
```

Requisitos: Python 3.9+ y Node.js 18+.

## Cómo se usa

| Quiero… | Cómo |
|---|---|
| Añadir actividad | Escribe `9:30 Reunión`, `14 Comer` o solo `Gimnasio` (se pone 1 h después de la última) |
| Cambiar la hora | Pincha en la hora y edítala; el horario se reordena solo |
| Mover descripciones | Arrastra una actividad encima de otra → **intercambian** texto y color (las horas se quedan) |
| Planificar con listas | Arrastra entre *Lista general*, *Horario* y *Lista del día* en cualquier dirección (o usa los botones → ↩ ◷ ☐) |
| Arrastrar pendientes | Lo no tachado de días anteriores aparece hoy con la etiqueta **↻ fecha** |
| Repetir rutina | Día vacío → **↺ Repetir horario de ayer** |
| Atajos | `←` `→` cambiar de día · `T` hoy · `N` nueva actividad |

Extras: indicador **AHORA** sobre la actividad en curso, duración de cada bloque, barra de progreso,
mini-gráfica de los últimos 7 días (pincha una barra para ir a ese día) y nota diaria.

## Estructura

```
planner-dia/
├─ backend/
│  ├─ app.py            API Flask
│  ├─ requirements.txt
│  └─ data/             aquí se guarda planner.json
├─ frontend/
│  ├─ server.js         servidor Node + proxy /api
│  └─ public/           index.html · styles.css · app.js
└─ .vscode/             launch (F5), tasks, settings
```

## API

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/day/AAAA-MM-DD` | Día (si es hoy, primero pasa los pendientes de días anteriores) |
| PUT | `/api/day/AAAA-MM-DD` | Guarda `{blocks, tasks, note}` |
| GET / PUT | `/api/backlog` | Lista general (`{items: [...]}` en PUT) |
| GET | `/api/summary?end=AAAA-MM-DD&days=7` | Progreso por día |

## Ideas para seguir

- **Plantillas** de rutina (“día de oficina”, “teletrabajo”, “finde”) para aplicar con un clic.
- **Avisos del navegador** 5 min antes de cada actividad.
- **Prioridad / energía** en las tareas (🔥 importante, ☕ fácil) para ordenar la lista.
- **Foco Pomodoro** en la actividad marcada como AHORA.
- **Resumen semanal**: qué tareas se arrastran más días (señal de que hay que partirlas o soltarlas).
- **Exportar a .ics** para ver el horario en Outlook/Google Calendar.
