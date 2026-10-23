# Commits

Todo ciclo 0 → 1 validado termina con un commit convencional:

    <tipo>(<alcance>): <descripción corta en inglés>

- El commit registra la hipótesis, el corte y la evidencia del ciclo.
- Lo no validado se queda en la dev branch; no se integra.
- Tipos: feat, fix, refactor, test, docs, chore, perf, build, ci, style, revert, security, release, hotfix, wip.
- Alcances: web, api, shared, db, plans, deps, ci, rules, ui, auth, ai, docs, config.
- El asunto es una sola línea, en inglés, con el alcance incluido. El cuerpo, cuando el ciclo lo
  exija, registra la hipótesis, el corte y la evidencia sin secretos.
- Ningún ciclo se considera terminado sin su commit convencional.
- El commit sigue el gate de `.roo/rules/04-verificacion.md`.
