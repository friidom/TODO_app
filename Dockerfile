FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines these at build time, so they are build arguments rather than
# runtime environment: changing one means rebuilding the image.
#
# The two Supabase values are placeholders, not credentials. src/services/api/
# supabase.ts throws at module load if they are absent, and realtime, attachments
# and avatar upload still import it — so the board page would not open without
# them. Those three features stay broken here until B9/B10 move them to the API.
ARG VITE_API_URL=/api/v1
ARG VITE_SUPABASE_URL=https://placeholder.supabase.co
ARG VITE_SUPABASE_PUBLISHABLE_KEY=placeholder-key

ENV VITE_API_URL=$VITE_API_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run build


FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
