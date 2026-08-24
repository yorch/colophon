---
title: Add your own storage
description: Putting Colophon bundles on a store it does not ship with, through the colophonStorageExtensionPoint, without forking the backend.
type: how-to
tags: [customisation, backend, storage]
---

# Add your own storage

Colophon ships two bundle stores: `local` for development and `s3` for
everything S3-compatible — which is most object storage, including MinIO,
Ceph, Cloudflare R2 and GCS through its HMAC endpoint. If yours is not one of
those, Azure Blob being the obvious case, you add it from your own backend
module. You do not fork the plugin.

Three pieces: an implementation, a module that registers it, and a config key
that selects it.

## 1. Implement `BundleStorage`

```ts
import { NotFoundError } from '@backstage/errors';
import type { BundleStorage } from '@brnby/plugin-colophon-backend';

export class AzureBundleStorage implements BundleStorage {
  constructor(private readonly container: ContainerClient) {}

  async has(key: string): Promise<boolean> {
    return this.container.getBlockBlobClient(key).exists();
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await this.container.getBlockBlobClient(key).downloadToBuffer();
    } catch (error) {
      if (isBlobNotFound(error)) {
        throw new NotFoundError(`No object at storage key "${key}"`);
      }
      throw error;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.container.getBlockBlobClient(key).uploadData(body, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
  }
}
```

Import the type from the package's **main entry point**.
`@brnby/plugin-colophon-backend` declares no `exports` map, so
`@brnby/plugin-colophon-backend/alpha` does not resolve at all.

Three methods, and two things worth getting right:

- **`get` must throw `NotFoundError`** for an absent key. The backend
  distinguishes "this page is not published" from "the store is broken" on
  exactly that, and a store that returns an empty buffer instead turns a
  missing blob into a blank page.
- **`put` is not on the read path.** The publisher CLI writes bundles; the
  backend only ever reads them. `put` exists so tests and local development
  can seed a store, and a deployment is expected to hand the backend
  read-only credentials. If yours cannot write, throw.

Keys are path-like (`blobs/ab/<sha256>`, `bundles/<id>/revisions/…`) and
arrive from HTTP input. A filesystem-backed store must resolve them safely;
an object store can use them unchanged.

## 2. Register it from a backend module

```ts
import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { colophonStorageExtensionPoint } from '@brnby/plugin-colophon-backend';
import { AzureBundleStorage } from './AzureBundleStorage';

export const colophonModuleAzureStorage = createBackendModule({
  pluginId: 'colophon',
  moduleId: 'azure-storage',
  register(env) {
    env.registerInit({
      deps: { colophonStorage: colophonStorageExtensionPoint },
      async init({ colophonStorage }) {
        colophonStorage.addFactory('azure', ({ config, logger }) => {
          const container = config?.getString('container');
          if (!container) {
            throw new Error('colophon.storage.azure.container is required');
          }
          logger.info(`Colophon bundles in Azure container ${container}`);
          return new AzureBundleStorage(clientFor(container));
        });
      },
    });
  },
});
```

Then in your backend:

```ts
backend.add(import('@brnby/plugin-colophon-backend'));
backend.add(colophonModuleAzureStorage);
```

`pluginId: 'colophon'` is what makes this a module OF the Colophon plugin,
which is what makes the ordering work: Backstage initialises every module of
a plugin before the plugin itself, so a factory registered here is always in
place by the time the plugin builds its store. There is no ordering to
arrange between modules, and no lifecycle hook to hang this on.

The factory is handed its **own slice** of config — `colophon.storage.azure`,
so it reads `container`, not `azure.container` — and a logger. It is not
handed the root config, deliberately: your module can ask for
`coreServices.rootConfig` in its own `deps` and close over it if it genuinely
needs something outside its own key.

It may be `async` if setup cannot be deferred, but it runs on the startup
path, so anything that can be lazy should be.

**Throw for missing configuration rather than defaulting.** The factory runs
during backend startup, so a throw is a loud failure at boot with the store
named. A default is a store pointed somewhere plausible and wrong, which
surfaces as a 404 on the first page anyone opens. That exact mistake has
already cost this project a release.

## 3. Select it, and declare its keys

```yaml
colophon:
  storage:
    type: azure
    azure:
      container: docs
```

Add a `config.d.ts` to your module's package and point `configSchema` at it:

```ts
export interface Config {
  colophon?: {
    storage?: {
      azure?: {
        container?: string;
        /** @visibility secret */
        connectionString?: string;
      };
    };
  };
}
```

```json
{ "configSchema": "config.d.ts" }
```

Backstage merges the schemas every package contributes **additively**, so
your keys land on the same `colophon.storage` object as `local` and `s3`
rather than colliding with them. That is what keeps
`backstage-cli config:check --strict` useful: without this file `--strict`
rejects `colophon.storage.azure` as undeclared, and with it a typo in
`container` is still caught. `@visibility secret` works here exactly as it
does anywhere else.

## What fails, and when

Every one of these is a startup failure. None of them is deferred to the
first read.

| Situation | Result |
| --- | --- |
| `type` names nothing registered | Backend stops: `Unknown colophon.storage.type "azur"; registered types are "azure", "local", "s3". Register another with colophonStorageExtensionPoint from a backend module.` |
| Two modules register the same name | The second one stops the backend: `A colophon.storage factory named "azure" is already registered` |
| A factory throws | Wrapped, naming the store: `The colophon.storage factory for type "azure" failed; caused by …` |

The duplicate check covers `local` and `s3` too — they register through the
same `addFactory` call before any module runs, so there is one lookup path
rather than a built-in shortcut and an adopter path that nothing exercises.
It also means you cannot silently replace `local`; pick another name.

## Why a registry and not a `setStorage` seam

Where bundles live is a deployment decision, and deployment decisions belong
in `app-config.yaml`. An extension point that took a store directly would
move the choice into TypeScript: staging and production would then differ by
a code branch rather than a config key, and the same backend image could no
longer be promoted between them. Registering a *name* keeps one image and one
switch.

## The CLI's `BundleStorage` is a different interface

`@brnby/colophon-cli` exports a type with the same name and five methods —
`has`, `get`, `put`, plus `list` and `delete`. They stay separate on purpose.

The publisher writes and collects garbage, so it needs to enumerate a prefix
and remove objects. The backend does neither: it is expected to hold
read-only credentials, and a merged interface would mean every custom store
had to implement `delete` to satisfy a reader that never calls it. Adding
`list` and `delete` to the CLI's copy was already a breaking change once for
anyone who had implemented it; keeping the backend's at three methods is what
stopped that from being breaking twice.

If you want your store on **both** halves — a custom backend reader and
`colophon gc` against the same bucket — implement both interfaces on one
class. Nothing prevents it, and the three shared methods have identical
signatures.

## Verifying it

Unit tests will tell you the class works and nothing about whether the seam
does. The thing worth running is a publish and a read through a real backend
with your module installed:

1. `colophon publish` a small `docs/` tree so blobs and a manifest reach the
   store.
2. Start the backend with `colophon.storage.type` set to your name.
3. Open the docs page in the portal.

If the page renders, the blob came out of your store — nothing else in the
backend can serve it. `dev-app/backend/src/scratchStorage.ts` in this
repository is a working third store registered exactly this way, kept around
so the adopter path is something that runs rather than something documented.
