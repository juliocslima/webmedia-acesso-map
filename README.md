# AcessoMap Video v0.3

PWA mobile-first para mapeamento colaborativo de barreiras de acessibilidade urbana com anotação temporal, anonimização local de vídeo, localização aproximada, validação comunitária e assistência de IA para detecção e rastreamento temporal de rostos.

## Princípio de privacidade

O backend recebe somente o vídeo já anonimizado e coordenadas geográficas quantizadas. O vídeo original permanece no dispositivo do usuário.

Na v0.3, cada região sensível é representada como um **track temporal** composto por intervalo ativo e keyframes. Entre keyframes, a posição e o tamanho da máscara são interpolados durante a sanitização. Para rostos, o navegador pode amostrar o vídeo localmente e associar detecções consecutivas; o resultado permanece sujeito à revisão humana.

## Stack

- Frontend: React + TypeScript + Vite + Leaflet
- Detecção local de rostos: MediaPipe Tasks Vision
- Tracking temporal: amostragem local + associação espacial + keyframes
- PWA: manifest + service worker simples
- Backend: FastAPI + SQLite
- Persistência de mídia: volume local no MVP
- Execução: Docker Compose + Nginx

## Funcionalidades v0.3

- Capturar/carregar vídeo pelo dispositivo móvel
- Selecionar categoria de barreira
- Marcar início/fim temporal da ocorrência
- Obter localização e reduzi-la para uma grade aproximada de ~50 m antes do envio
- Detectar rostos localmente no frame atual como sugestões de privacidade
- Aceitar ou descartar individualmente sugestões da IA
- Criar tracks manuais para rosto ou placa
- Adicionar keyframes manuais em diferentes instantes do vídeo
- Definir início e fim de cada track no frame atual
- Rastrear rostos automaticamente por amostragem local do vídeo
- Associar detecções entre amostras por sobreposição e distância espacial
- Interpolar as máscaras entre keyframes durante a anonimização
- Corrigir manualmente a trajetória adicionando novos keyframes
- Impedir a anonimização enquanto houver sugestões de IA pendentes
- Gerar uma cópia WebM anonimizada no navegador
- Revisar o vídeo anonimizado antes de publicar
- Registrar métricas de privacidade, tracking e revisão human-in-the-loop
- Visualizar ocorrências no mapa
- Confirmar ou contestar ocorrências
- Exportar GeoJSON e CSV

## Modelo temporal de privacidade

Cada track contém:

- tipo: rosto ou placa;
- origem: manual ou sugestão da IA;
- estado de aceitação;
- instante inicial e final;
- conjunto ordenado de keyframes;
- posição e tamanho normalizados em cada keyframe.

Durante a sanitização, o AcessoMap calcula a caixa aplicável ao instante corrente. Quando o instante está entre dois keyframes, as coordenadas e dimensões são interpoladas linearmente. Fora do intervalo ativo do track, nenhuma máscara é aplicada.

## Métricas de privacidade

Além das métricas da v0.2, a v0.3 registra:

- quantidade de tracks temporais;
- quantidade total de keyframes;
- quantidade de amostras usadas no tracking;
- tempo acumulado de tracking;
- tempo de detecção;
- tempo de sanitização;
- sugestões aceitas e rejeitadas;
- máscaras/tracks manuais.

Essas métricas podem ser exportadas em CSV e apoiam a avaliação do fluxo privacy-aware e human-in-the-loop.

## Executar com Docker

```bash
docker compose up --build
```

Acesse: http://localhost:8080

Health check esperado:

```json
{
  "status": "ok",
  "version": "0.3.0"
}
```

## Cenário de validação da v0.3

1. carregar um vídeo em que um rosto se mova lateralmente;
2. pausar em um frame no qual o rosto esteja claramente visível;
3. clicar em `Sugerir rostos neste frame`;
4. aceitar uma das sugestões;
5. selecionar o track do rosto;
6. clicar em `Rastrear rosto no vídeo`;
7. navegar pelo vídeo e verificar a trajetória da máscara;
8. em um ponto com erro, desenhar novamente a caixa para criar um keyframe corretivo;
9. criar um novo track manual de placa;
10. adicionar pelo menos dois keyframes da placa em posições diferentes;
11. ajustar início/fim do track quando necessário;
12. gerar o vídeo anonimizado com tracks temporais;
13. revisar o vídeo sanitizado;
14. publicar e reproduzir a ocorrência no mapa;
15. verificar `/api/health` retornando `0.3.0`;
16. exportar CSV e conferir as métricas de tracking.

## Roadmap

- v0.4: fila offline em IndexedDB + sincronização posterior
- v0.5: moderação, reputação e score de confiança
- v0.6: exportação institucional e painel analítico

## Licença

MIT License.
