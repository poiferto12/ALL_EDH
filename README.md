## Estado del proyecto y limitaciones

ALL_EDH es un proyecto personal en desarrollo. El sistema utiliza reglas heurísticas para clasificar y puntuar cartas, por lo que las recomendaciones no deben considerarse mazos optimizados ni sustituir una revisión manual.

Entre las limitaciones actuales se encuentran:

* Las categorías se detectan principalmente mediante el análisis del texto de las cartas.
* La lista de combos y sinergia es parcial.
* Los pesos del sistema de puntuación todavía necesitan validación y ajuste.
* La curva de maná y la distribución de fuentes de color no se evalúan completamente.
* La base de maná utiliza una lógica sencilla y es muy probable que requiera ajustes manuales.
* La calidad de los resultados puede variar considerablemente según el comandante y el arquetipo.
* Algunas cartas con texto complejo pueden clasificarse de forma incorrecta o incompleta.

El objetivo actual es crear más casos de prueba, mejorar la explicación de las puntuaciones y comparar los resultados con mazos reales.

## Servidor opcional de EDHREC

La aplicación funciona usando únicamente Scryfall.

Opcionalmente, puede ejecutarse un servidor local en Python para obtener cartas populares y cartas con sinergia asociadas a un comandante. Estos datos se usan como señal adicional de puntuación y para comparar el mazo generado contra una lista popular aproximada.

Instalación:

```bash
pip install -r requirements.txt
```

Ejecución:

```bash
uvicorn server:app --reload --port 8000
```

Endpoint usado por la aplicación:

```bash
http://localhost:8000/api/commander/:name
```

Si el servidor no está disponible, la aplicación continúa funcionando normalmente.

## Aviso

Este proyecto usa datos de cartas proporcionados por Scryfall.

Este proyecto no está afiliado ni respaldado por Wizards of the Coast, Scryfall o EDHREC.
