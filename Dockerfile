FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY Src ./Src
COPY Python ./Python
COPY public ./public

RUN mkdir -p /app/data

ENV BOT_MODE=paper
ENV PORT=3000
ENV POLL_SECONDS=60
ENV START_BALANCE_USD=1000
ENV PAPER_PERFORMANCE_PATH=/app/data/paper-performance.jsonl
ENV STATISTICAL_JOURNAL_PATH=/app/data/statistical-journal.jsonl

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node","Src/index.js"]
