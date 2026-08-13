# AcessoMap Video v0.2

PWA mobile-first para mapeamento colaborativo de barreiras de acessibilidade urbana com anotação temporal, anonimização local de vídeo, localização aproximada, validação comunitária e assistência de IA para detecção de rostos.

## Princípio de privacidade

O backend recebe somente o vídeo já anonimizado e coordenadas geográficas quantizadas. O vídeo original permanece no dispositivo do usuário.

Na v0.2, a detecção de rostos é usada apenas como assistência: as detecções são apresentadas como sugestões pendentes e precisam ser aceitas ou descartadas pelo usuário antes da geração do vídeo anonimizado. Máscaras manuais continuam disponíveis para rostos e placas.

## Stack

- Frontend: React + TypeScript + Vite + Leaflet
- Detecção local de rostos: MediaPipe Tasks Vision
- PWA: manifest + service worker simples
- Backend: FastAPI + SQLite
- Persistência de mídia: volume local no MVP
- Execução: Docker Compose + Nginx

## Funcionalidades v0.2

- Capturar/carregar vídeo pelo dispositivo móvel
- Selecionar categoria de barreira
- Marcar início/fim temporal da ocorrência
- Obter localização e reduzi-la para uma grade aproximada de ~50 m antes do envio
- Detectar rostos localmente no frame atual como sugestões de privacidade
- Aceitar ou descartar individualmente sugestões da IA
- Criar máscaras manuais de privacidade para rosto ou placa
- Impedir a anonimização enquanto houver sugestões de IA pendentes de revisão
- Gerar uma cópia WebM anonimizada no navegador
- Revisar o vídeo anonimizado antes de publicar
- Registrar métricas de privacidade e revisão human-in-the-loop
- Visualizar ocorrências no mapa
- Confirmar ou contestar ocorrências
- Exportar GeoJSON e CSV

## Métricas de privacidade

A v0.2 registra, por ocorrência, informações como:

- processamento no dispositivo;
- confirmação de que o vídeo bruto não foi enviado;
- revisão humana concluída;
- quantidade de máscaras manuais;
- quantidade de sugestões da IA;
- sugestões aceitas e rejeitadas;
- tempo de detecção;
- tempo de sanitização.

Essas métricas apoiam a avaliação do fluxo privacy-aware e human-in-the-loop.

## Executar com Docker

```bash
docker compose up --build
```

Acesse: http://localhost:8080

Health check esperado:

```json
{
  "status": "ok",
  "version": "0.2.0"
}
```

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

## Validação funcional da v0.2

Em 13/08/2026 foi validado com sucesso o fluxo ponta a ponta:

1. registrar barreira;
2. selecionar vídeo com rosto visível;
3. pausar em um frame;
4. solicitar sugestões automáticas de rostos;
5. visualizar a caixa sugerida;
6. aceitar uma sugestão;
7. descartar outra sugestão quando aplicável;
8. adicionar máscara manual de placa;
9. gerar vídeo anonimizado;
10. revisar o vídeo sanitizado;
11. obter localização aproximada;
12. publicar a ocorrência;
13. abrir o mapa;
14. reproduzir o vídeo publicado.

O endpoint `/api/health` retornou a versão `0.2.0` durante a validação.

## Roadmap

- v0.3: máscaras temporais e rastreamento de regiões ao longo do vídeo; evolução da anonimização de placas
- v0.4: fila offline em IndexedDB + sincronização posterior
- v0.5: moderação, reputação e score de confiança
- v0.6: exportação institucional e painel analítico

## Licença

MIT License.
