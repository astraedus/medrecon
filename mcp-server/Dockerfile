FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --production=false

# Copy source code
COPY . .

# Compile TypeScript
RUN npx tsc

# Remove dev dependencies after build
RUN npm prune --production

EXPOSE 5000

CMD ["node", "dist/index.js"]
