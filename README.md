# AcessoMap Video v0.1

MVP de uma PWA mobile-first para mapeamento colaborativo de barreiras de acessibilidade urbana com anotação temporal, anonimização local de vídeo, localização aproximada e validação comunitária.

## Princípio de privacidade

O backend recebe somente o vídeo já anonimizado e coordenadas geográficas quantizadas. O vídeo original permanece no dispositivo do usuário.

## Stack

- Frontend: React + TypeScript + Vite + Leaflet
- PWA: manifest + service worker simples
- Backend: FastAPI + SQLite
- Persistência de mídia: volume local no MVP
- Execução: Docker Compose + Nginx

## Funcionalidades v0.1

- Capturar/carregar vídeo pelo dispositivo móvel
- Selecionar categoria de barreira
- Marcar início/fim temporal da ocorrência
- Obter localização e reduzi-la para uma grade aproximada de ~50 m antes do envio
- Criar máscaras manuais de privacidade (rosto/placa) em um frame
- Gerar uma cópia WebM anonimizada inteiramente no navegador
- Revisar o vídeo anonimizado antes de publicar
- Visualizar ocorrências no mapa
- Confirmar ou contestar ocorrências
- Exportar GeoJSON e CSV

## Executar com Docker

```bash
docker compose up --build
```

Acesse: http://localhost:8080

## Executar em desenvolvimento

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Roadmap

- v0.2: sugestões automáticas de rostos com inferência local
- v0.3: máscaras temporais e rastreamento de regiões ao longo do vídeo
- v0.4: fila offline em IndexedDB + sincronização posterior
- v0.5: moderação, reputação e score de confiança
- v0.6: exportação institucional e painel analítico
