# Publisher image: what CI runs to turn a docs/ tree into a Colophon bundle.
#
# The consumer is someone else's pipeline, in someone else's repository, so
# the image is built to be run as `docker run -v "$PWD:/work" colophon <cmd>`
# with the docs mounted — never with the source baked in.

# ---- build ------------------------------------------------------------------
FROM node:24-bookworm-slim AS build

WORKDIR /app

# Corepack ships with Node 24 but the pinned Yarn must be materialised before
# any install can run.
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable && corepack prepare yarn@4.13.0 --activate

# Workspace manifests only, so dependency installation caches independently of
# source edits. A docs-only or source-only change does not re-resolve the tree.
COPY packages/colophon-common/package.json packages/colophon-common/
COPY packages/colophon-cli/package.json packages/colophon-cli/
COPY plugins/colophon-backend/package.json plugins/colophon-backend/
COPY plugins/colophon-react/package.json plugins/colophon-react/
COPY plugins/colophon/package.json plugins/colophon/

RUN yarn install --immutable

COPY tsconfig.json ./
COPY packages/colophon-common packages/colophon-common
COPY packages/colophon-cli packages/colophon-cli

# Build, then prepack. prepack rewrites each package.json's `main` and
# `types` from the src entrypoints used in development to the dist ones, which
# is what makes the built CLI resolve @brnby/colophon-common to dist rather
# than to TypeScript source that Node cannot load.
RUN yarn workspace @brnby/colophon-common run build \
 && yarn workspace @brnby/colophon-cli run build \
 && yarn workspace @brnby/colophon-common run prepack \
 && yarn workspace @brnby/colophon-cli run prepack

# Drop dev dependencies from the tree that gets copied forward.
RUN yarn workspaces focus --production --all

# ---- runtime ----------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

# Run as the image's existing unprivileged user. The publisher only ever reads
# the mounted docs and writes to object storage, so it needs no root.
ENV NODE_ENV=production
WORKDIR /work

COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/package.json
COPY --from=build --chown=node:node /app/packages/colophon-common/dist /app/packages/colophon-common/dist
COPY --from=build --chown=node:node /app/packages/colophon-common/package.json /app/packages/colophon-common/package.json
COPY --from=build --chown=node:node /app/packages/colophon-cli/dist /app/packages/colophon-cli/dist
COPY --from=build --chown=node:node /app/packages/colophon-cli/bin /app/packages/colophon-cli/bin
COPY --from=build --chown=node:node /app/packages/colophon-cli/package.json /app/packages/colophon-cli/package.json

USER node

ENTRYPOINT ["node", "/app/packages/colophon-cli/bin/colophon"]
CMD ["--help"]
