FROM node:18-alpine

# Configurar timezone
ENV TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
