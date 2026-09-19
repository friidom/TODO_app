FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# prisma.config.ts resolves env("DATABASE_URL") eagerly, even for `generate`,
# which never connects. Any parseable URL satisfies it; this one is never used.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

# generate before build: 15+ source files import types from @prisma/client, so
# tsc has nothing to typecheck against until the client exists.
RUN npm run db:generate && npm run build


FROM node:24-alpine

WORKDIR /app

# node_modules is carried whole rather than reinstalled with --omit=dev: the
# entrypoint needs the `prisma` CLI, which is a devDependency, and the generated
# client lives in node_modules/.prisma/client. Costs image size, saves a second
# install that would have to stay in step with the first.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# All three are read by `prisma migrate deploy`, not by the server.
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
COPY package.json ./package.json

# --chmod because git on Windows does not carry the execute bit.
COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["docker-entrypoint.sh"]
