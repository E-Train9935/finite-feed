# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY apps/api/package*.json ./apps/api/
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app/apps/api
ENV NODE_ENV=production
COPY apps/api/package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/web/dist /app/apps/web/dist
RUN mkdir -p /app/apps/api/data && chown -R node:node /app
USER node
WORKDIR /app
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
