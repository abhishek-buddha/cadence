FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_CONVEX_URL=https://rapid-pheasant-510.convex.cloud
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ARG CONVEX_DEPLOY_KEY
RUN CONVEX_DEPLOY_KEY=$CONVEX_DEPLOY_KEY npx convex deploy --cmd 'npm run build' -y

FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 10000
CMD ["/docker-entrypoint.sh"]
