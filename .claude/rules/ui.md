---
paths:
  - "src/ui/**/*.js"
  - "src/styles/**/*.css"
  - "src/main.js"
  - "src/data/versiones.json"
  - "package.json"
  - "index.html"
---

# Interfaz del paramétrico

## Sin framework, a propósito

JavaScript de módulos ES sobre Vite. La lógica ya funcionaba en vanilla y
portarla sería reescribirla.

**Carga diferida:** `app.js` se importa solo al abrir un proyecto, y se comunica
por el evento `proyecto:abierto`. No lo vuelvas a importar en el arranque: la
portada debe aparecer de inmediato.

## Marca

El naranja y la paleta viven en `src/styles/tokens.css`. **No teclees colores en
un componente.** El `--accent-ink` existe porque el naranja de marca no pasa
contraste AA sobre papel.

Sin emoji.

## Compatibilidad del estado guardado

Las cuatro rutas de carga mezclan con `Object.assign` en lugar de reemplazar, y
por eso al renombrar la etiqueta «grupo» a «tipo de cargador» **no** se renombró
la llave de datos `grupos`. Romper el formato del estado guardado es lo que
significa una versión mayor aquí. **No renombres llaves de datos.**

## Versión y bitácora

La versión vive **únicamente en `package.json`**. `vite.config.js` la lee al
compilar. La bitácora es `src/data/versiones.json` y su entrada va en el **mismo
commit** que el cambio de versión.

La versión y la fecha de compilación van también en el pie del documento de
propuesta: sin eso, una propuesta impresa no se puede reconciliar con el código
que produjo sus cifras.
