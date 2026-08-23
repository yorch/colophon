---
'@brnby/plugin-colophon-react': minor
'@brnby/plugin-colophon': minor
---

Adopter `link` and `image` overrides now win.

`DocsBrowser` installed its reference-resolving `link` and `image` components
as the innermost provider, so an app's overrides for those two slots were
always shadowed — five of the seven slots were overridable and two silently
were not. Colophon now fills those slots only when the app has not claimed
them, and exports `useColophonReference` so an override that does claim one can
still resolve relative links, anchors and assets the way the built-in
components do.

Also fixes two design tokens that do not exist in `@backstage/ui`:
`--bui-fg-link` and `--bui-bg-surface-1`. The first left the bundle row with no
visible focus indicator, which is an accessibility defect — `var()` with no
fallback resolves to nothing and drops the declaration silently. A test now
checks every `--bui-*` name in the stylesheet against the stylesheet
`@backstage/ui` ships.

`ensureColophonStyles` and `COLOPHON_STYLE_ELEMENT_ID` are now exported, making
the documented stylesheet opt-out a supported API.
