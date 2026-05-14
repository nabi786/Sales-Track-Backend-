# ---------- 1. Base image ----------
FROM node:18-alpine

# ---------- 2. Set working directory ----------
WORKDIR /app

# ---------- 3. Copy package files ----------
COPY package.json package-lock.json* ./

# ---------- 4. Install dependencies ----------
RUN npm install

# ---------- 5. Copy all project files ----------
COPY . .

# ---------- 6. Expose backend port ----------
EXPOSE 3000

# ---------- 7. Start server ----------
CMD ["npm", "start"]