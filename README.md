# ALL_EDH - Commander Deck Builder

Generador de mazos de Commander para Magic: The Gathering con heuristica avanzada de seleccion de cartas. Usa la API de Scryfall y prioriza tu coleccion personal.

## Caracteristicas

- **Deteccion de combos conocidos**: Identifica piezas de combos clasicos de Commander (pocos de momento)
- **Paquetes de sinergia**: Reconoce grupos de cartas que funcionan bien juntas (Blink package, Aristocrats engine, etc.)
- **Heuristica avanzada**: Evalua eficiencia de mana, palabras clave de combate, efectos ETB/death, escalabilidad en multiplayer
- **Priorizacion de coleccion**: Las cartas que ya tienes reciben bonus para minimizar compras
- **Arquetipos predefinidos**: Voltron, Tokens, Aristocrats, Storm, Graveyard, Control, y mas
- **Control de presupuesto**: Limita el coste de las cartas que necesitas comprar

## Requisitos

- **Node.js** 18 o superior
- Un navegador web moderno

## Instalacion y Ejecucion

### Opcion 1: Con npm (Recomendada)

```bash
# Clona el repositorio
git clone https://github.com/poiferto12/ALL_EDH.git
cd ALL_EDH

# Instala dependencias
npm install

# Inicia el servidor de desarrollo
npm run dev
```

Abre tu navegador en `http://localhost:5173`

### Opcion 2: Con servidor Python simple

Si no tienes Node.js instalado:

```bash
# Clona el repositorio
git clone https://github.com/poiferto12/ALL_EDH.git
cd ALL_EDH

# Inicia un servidor HTTP simple
python3 -m http.server 8080
```

Abre tu navegador en `http://localhost:8080`

**Nota**: Esta opcion puede tener problemas con ES modules dependiendo del navegador.

### Opcion 3: VS Code Live Server

Si usas VS Code, puedes instalar la extension "Live Server" y hacer click derecho en `index.html` -> "Open with Live Server".

## Uso

1. **Nombre del Comandante**: Escribe el nombre exacto de tu comandante (en ingles)
2. **Tu Coleccion** (opcional): Pega tu lista de cartas, una por linea. Puedes usar formato `2x Sol Ring` para cantidades
3. **Estrategia**: Selecciona el arquetipo principal de tu mazo
4. **Plantilla**: Ajusta cuantas cartas de cada tipo quieres (tierras, ramp, draw, etc.)
5. **Presupuesto**: Opcional - limita el coste total de cartas a comprar

## Sistema de Puntuacion

Cada carta recibe puntos basados en:

| Factor | Descripcion |
|--------|-------------|
| Coleccion | +50 pts si ya la tienes |
| Tema | +60-78 pts si encaja con el arquetipo |
| Sinergia | +25-40 pts basado en EDHREC y mecanicas |
| Combos | +30-60 pts si forma parte de un combo conocido |
| Paquetes | +20-40 pts si pertenece a un grupo sinergico |
| Staples | +25 pts para Sol Ring, Cyclonic Rift, etc. |
| Eficiencia | +10-18 pts para cartas con buen ratio coste/efecto |
| Keywords | +5-20 pts por flying, hexproof, cascade, etc. |
| Penalizaciones | -5 a -12 pts para cartas situacionales o que ayudan oponentes |

## Combos Detectados

El sistema reconoce combos clasicos como:

- Peregrine Drake + Deadeye Navigator (mana infinito)
- Dramatic Reversal + Isochron Scepter (mana infinito)
- Kiki-Jiki + Zealous Conscripts (criaturas infinitas)
- Thassa's Oracle + Demonic Consultation (win instantaneo)
- Exquisite Blood + Sanguine Bond (drain infinito)
- Mikaeus + Triskelion (damage infinito)
- Y muchos mas...

## Paquetes de Sinergia

Detecta grupos de cartas que funcionan bien juntas:

- **Blink Package**: Panharmonicon, Conjurer's Closet, Mulldrifter...
- **Token Doublers**: Doubling Season, Parallel Lives, Anointed Procession...
- **Aristocrats**: Blood Artist, Viscera Seer, Grave Pact...
- **Reanimator**: Reanimate, Entomb, Karmic Guide...
- **Storm**: Thousand-Year Storm, Storm-Kiln Artist, Aetherflux Reservoir...
- **Wheels**: Wheel of Fortune, Notion Thief, Smothering Tithe...
- **Equipment**: Stoneforge Mystic, Puresteel Paladin, Sword of Feast and Famine...

## Estructura del Proyecto

```
ALL_EDH/
├── index.html      # Interfaz principal
├── app.js          # Logica de la aplicacion
├── scoring.js      # Sistema de puntuacion y heuristicas
├── styles.css      # Estilos
├── package.json    # Dependencias npm
└── README.md       # Este archivo
```

## API Utilizada

- **Scryfall API**: Busqueda de cartas y datos de legalidad
- **EDHREC API** (opcional): Datos de popularidad y sinergia (requiere servidor proxy local)

## Proximos Pasos

- [ ] Servidor backend propio para cachear datos
- [ ] Exportar mazo a formatos populares (MTGO, Arena, Moxfield)
- [ ] Guardar mazos en localStorage/cuenta
- [ ] Modo oscuro/claro
- [ ] Visualizacion de curva de mana
- [ ] Sugerencias de reemplazos para cartas caras

## Contribuir

Las contribuciones son bienvenidas. Por favor abre un issue para discutir cambios grandes antes de hacer un PR.

## Licencia

MIT
