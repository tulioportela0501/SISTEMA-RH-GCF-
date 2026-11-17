FROM node:22-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
# Aplica as migrações pendentes e inicia o sistema
CMD ["sh", "-c", "npm run db:migrate && npm run start -- -H 0.0.0.0 -p 3000"]
