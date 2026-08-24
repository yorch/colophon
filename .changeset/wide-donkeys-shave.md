---
'@brnby/colophon-common': minor
'@brnby/colophon-cli': minor
'@brnby/plugin-colophon': minor
'@brnby/plugin-colophon-react': minor
'@brnby/plugin-colophon-backend': minor
---

**Bundle storage is now an extension point.** An organisation whose object
storage is neither a filesystem nor S3-compatible — Azure Blob being the
obvious case — had exactly one option: fork the backend. `createBundleStorage`
was a hardcoded `if (local) … if (s3) … else throw`, `BundleStorage` was not
exported, and the plugin built its own store with nothing to inject into.

`colophonStorageExtensionPoint` is the first extension point this plugin
exposes. A backend module registers a **named factory**, and
`colophon.storage.type` selects it by name:

```ts
import { colophonStorageExtensionPoint } from '@brnby/plugin-colophon-backend';

export const colophonModuleAzureStorage = createBackendModule({
  pluginId: 'colophon',
  moduleId: 'azure-storage',
  register(env) {
    env.registerInit({
      deps: { colophonStorage: colophonStorageExtensionPoint },
      async init({ colophonStorage }) {
        colophonStorage.addFactory({
          name: 'azure',
          factory: ({ config }) =>
            new AzureBundleStorage(config?.getString('container')),
        });
      },
    });
  },
});
```

```yaml
colophon:
  storage:
    type: azure
    azure: { container: docs }
```

A *name* rather than a store, because where bundles live is a deployment
decision and deployment decisions belong in `app-config.yaml`. An extension
point taking a store directly would mean staging and production differed by a
code branch rather than a config key, and the same backend image could no
longer be promoted between them.

**`local` and `s3` register through the same `addFactory` call**, before any
module runs. There is one lookup path rather than a built-in shortcut and an
adopter path that nothing exercises — the shape this project has been bitten
by before. It also means the duplicate-name check covers them: a module
cannot silently replace `local`.

Newly exported from the package's single entry point (there is no `/alpha`
subpath): `colophonStorageExtensionPoint`, `ColophonStorageExtensionPoint`,
`BundleStorage`, `BundleStorageFactory`, `BundleStorageFactoryOptions`,
`BundleStorageRegistration`.

`addFactory` and the factory both take an options object rather than
positional arguments. This is the extension point's own signature and the
hardest thing in the package to change later, and `description`, an explicit
`override` and a deprecation marker are each free to add now and breaking once
anyone has called it. **Any method added to `BundleStorage` in future will be
optional** — a new required method would break every adopter store at once,
which is precisely what adding `list` and `delete` did to the CLI's copy.

*What an adopter gains:* a three-method interface — `has`, `get`, `put` — and
a factory that is handed its own slice of config plus a logger. Not the root
config: a module already has `coreServices.rootConfig` in its own `deps`.
Registration happens during module init and the store is built during plugin
init, which Backstage guarantees runs after every module of that plugin, so
there is no ordering to arrange and no lifecycle hook to hang it on.

*Failures are startup failures, never a 404 on the first read.* A `type`
nothing registered stops the backend and **names what is registered**, because
the set is open and the reader cannot look it up:
`Unknown colophon.storage.type "azur"; registered types are "local", "s3".
Register another with colophonStorageExtensionPoint from a backend module.`
A second factory for a taken name throws
`A colophon.storage factory named "local" is already registered`, naming the
module that lost. A factory that throws is wrapped with the store's name. A
factory that returns something that is not a store is refused at startup too —
types catch the naive case and not a cast through `any`, a JavaScript adopter
or a duck-typed SDK object, and without the check that store starts the backend
and fails on the first page opened. Registering after the store has been built
is refused rather than accepted and ignored.

*The backend now says where it reads from.* One line naming the resolved type,
and for the built-ins the resolved absolute directory or `s3://bucket/prefix`.
Nothing said so before, and `storage.local.root` silently resolving to the
wrong directory is a bug this project has already shipped. Each factory is
handed a logger tagged with its store's name.

*The config schema.* `colophon.storage.type` was `'local' | 's3'` and is now
`string`. It cannot stay an enum: an enum would reject every adopter's own
name outright. The check moved to startup, where the backend knows what it
installed. Sub-config still validates — a module declares its own
`colophon.storage.<name>` keys in its own `config.d.ts`, Backstage merges
package schemas additively, and `config:check --strict` continues to catch a
misspelling of the built-in keys *and* the adopter's.

*Existing deployments need no change.* `colophon.storage` is read exactly as
before, `type` still defaults to `local`, and both built-in stores are
selected by the same names with the same keys. No `app-config.yaml` edit, no
code change, nothing to migrate.

*Not merged with the CLI's `BundleStorage`*, which has five methods. The
publisher writes and collects garbage, so it needs `list` and `delete`; the
backend is expected to hold read-only credentials and calls neither. Merging
them would force every custom reader to implement a `delete` nothing calls.
`createColophonService` takes an optional `storage`; omitted, it behaves as
it always has.
