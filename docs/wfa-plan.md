# Plano técnico-científico para o WFA

## Pergunta central

Como uma aplicação web móvel pode apoiar crowdsensing de barreiras urbanas usando vídeo sem exigir o envio de conteúdo bruto ou localização precisa ao servidor?

## Contribuições demonstráveis

1. Pipeline multimídia privacy-by-design totalmente executado no navegador antes do upload.
2. Anotação temporal da barreira associada a um ponto geográfico aproximado.
3. Mapa colaborativo com confirmação/contestação comunitária.
4. Exportação interoperável em GeoJSON/CSV.

## Demonstração de 2–3 minutos

1. abrir a PWA no celular;
2. gravar/carregar vídeo curto;
3. desenhar máscara sobre rosto/placa;
4. gerar e revisar cópia anonimizada;
5. selecionar categoria e marcar intervalo;
6. capturar localização aproximada;
7. publicar;
8. abrir mapa e validar a ocorrência;
9. exportar GeoJSON.

## Métricas simples para o artigo

- tempo de anonimização local por segundo de vídeo;
- tamanho do arquivo original versus sanitizado;
- quantidade de dados pessoais enviados: bruto vs. fluxo proposto;
- tempo total do fluxo de publicação;
- precisão espacial publicada configurada em metros;
- compatibilidade funcional em pelo menos dois navegadores/dispositivos.

## Limitações declaradas da v0.1

- máscaras são espaciais e persistem na mesma posição durante o vídeo;
- não há detecção automática de placas;
- mapa usa tiles online;
- validação comunitária usa token local pseudônimo, sem reputação;
- armazenamento usa SQLite/volume local no MVP.
