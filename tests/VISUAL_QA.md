# QA de presentación

`node scripts/verify-visual-system.mjs --keep` renderiza las 16 páginas reales con fixtures sintéticas y el CSS actual. No crea sesiones ni consulta/escribe DB, Meta o servicios externos. Sin `--keep` elimina los artefactos al terminar.

Abrir uno de los HTML generados con `agent-browser`, obtener `agent-browser get cdp-url` y ejecutar `node scripts/check-visual-fixtures.mjs "<directorio generado>" "<CDP local>"`. Comprueba 390, 768, 1024, 1280 y 1440px, con acciones abiertas/cerradas, overflow y etiquetas de campos; guarda capturas en el directorio temporal. Los HTML son SSR: no sustituyen una prueba autenticada de mutaciones/hidratación en Production.

`node scripts/verify-presentation-contracts.mjs <commit-base>` confirma que no cambiaron consultas, argumentos de acciones ni handlers. Para Fase Visual 2 la base es `e60628a`.
