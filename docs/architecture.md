# Arquitetura v0.1

```text
┌────────────────────────────────────────────────────────────┐
│                    PWA / navegador móvel                  │
│                                                            │
│ câmera/arquivo -> anotação temporal -> máscaras locais    │
│                 -> Canvas + MediaRecorder -> revisão       │
│                                                            │
│ GPS -> quantização (~50 m)                                 │
└───────────────────┬────────────────────────────────────────┘
                    │ somente vídeo anonimizado + metadados
                    v
┌────────────────────────────────────────────────────────────┐
│                      FastAPI REST                           │
│  reports | validações | consulta espacial simples | export │
└────────────────────┬──────────────────────┬─────────────────┘
                     │                      │
                     v                      v
                SQLite/Postgres        mídia sanitizada
                                      volume/S3 futuro
```

## Fronteira de confiança

Dados que não devem atravessar a fronteira cliente-servidor:

1. vídeo original;
2. coordenada GPS precisa;
3. máscaras ou regiões não revisadas;
4. identificadores pessoais do colaborador.

## Evolução prevista

A v0.2 adicionará detecção local de rostos apenas como sugestão. A decisão de aplicar/remover máscaras continuará human-in-the-loop.
