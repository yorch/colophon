---
'@brnby/plugin-colophon-backend': minor
---

Declare a config schema for `colophon.*`, and read schedules the way the rest
of Backstage does.

The backend contributed no schema, so Backstage silently ignored any unknown
or misspelled key beneath `colophon` — the failure mode that once made
`storage.local.directory` be read as `storage.local.root`, with successful
publishes and 404ing reads. `config.d.ts` now covers every key the code
actually reads, and both S3 credential keys are marked `visibility: secret`.

`colophon.schedule.entityLinks` and `colophon.schedule.searchIndex` are now
parsed by `readSchedulerServiceTaskScheduleDefinitionFromConfig`, so `seconds`,
`hours`, `days`, ISO duration strings, cron expressions and `scope` all behave
here as they do everywhere else in the platform. The hand-rolled reader they
replace understood `frequency.minutes` alone and dropped anything else — a
`frequency: { seconds: 30 }` ran at the ten-minute default instead.

Two consequences worth knowing before upgrading:

- A `schedule.<task>` block must now carry both `frequency` and `timeout`.
  Previously either could be omitted and quietly completed from the defaults,
  which is exactly how the dropped value hid. Omitting the whole block still
  falls back to the default schedule.
- `ColophonConfig.entityLinkSchedule` and `.searchIndexSchedule` are typed
  `SchedulerServiceTaskScheduleDefinition` rather than the package's own
  `TaskSchedule`, which is no longer exported.
