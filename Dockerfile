# --------- 1. Install dependencies ----------
FROM node:18-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install


# --------- 2. Build application ----------
FROM node:18-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build


# --------- 3. Production container ----------
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy required files
COPY --from=builder /app ./
COPY .env .env

EXPOSE 3000

CMD ["npm", "start"]