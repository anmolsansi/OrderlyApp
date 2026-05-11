# Production-ish frontend image for OrderlyApp.
# Runtime config comes from NEXT_PUBLIC_* build args/env vars.
FROM node:25-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:25-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ARG NEXT_PUBLIC_VOICE_MODE=browser
ARG NEXT_PUBLIC_CHECKOUT_MODE=mock
ARG NEXT_PUBLIC_AUTH_PROVIDER=none
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_VOICE_MODE=$NEXT_PUBLIC_VOICE_MODE
ENV NEXT_PUBLIC_CHECKOUT_MODE=$NEXT_PUBLIC_CHECKOUT_MODE
ENV NEXT_PUBLIC_AUTH_PROVIDER=$NEXT_PUBLIC_AUTH_PROVIDER
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:25-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "server.js"]
