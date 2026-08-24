/**
 * The harness's own contribution to Colophon's config schema.
 *
 * `colophon.storage.type` is an open set, so the plugin cannot declare the
 * keys a store it has never heard of reads. Backstage merges the schemas
 * every package contributes ADDITIVELY, so this file is how an adopter's
 * module declares its own slice — the merged `colophon.storage` object ends
 * up with `local`, `s3` and `scratch` on it, and `config:check --strict`
 * still rejects a misspelling of any of the three.
 *
 * This exists to prove that composition works, not because the harness needs
 * validation. Copy the shape, not the store.
 */
export interface Config {
  colophon?: {
    storage?: {
      scratch?: {
        /**
         * Resolved against the backend process's working directory, not
         * against app-config.yaml.
         */
        directory?: string;
      };
    };
  };
}
