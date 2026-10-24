FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN npm install

COPY frontend ./frontend

RUN npm --workspace=frontend run build

EXPOSE 5173

CMD ["npm", "--workspace=frontend", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
