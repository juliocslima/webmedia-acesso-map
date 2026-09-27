# AcessoMap Video — Research Artifact v0.3.0 (WFA / WebMedia 2026)

Artefato de software associado ao artigo **“AcessoMap Video: Mapeamento Colaborativo e Sensível à Privacidade de Barreiras de Acessibilidade Urbana”**, aceito no **XXV Workshop de Ferramentas e Aplicações (WFA), WebMedia 2026**, submissão **#34781**.

PWA *mobile-first* para registro colaborativo de barreiras urbanas por vídeo, com anotação temporal, sanitização visual local, redução da precisão geográfica, validação comunitária e sugestões de rastreamento de rostos submetidas à revisão humana.

> **Instantâneo de pesquisa:** esta edição da documentação se destina ao arquivo **v0.3.0** vinculado ao artigo do WFA 2026. O pacote publicado deve conter o código, os arquivos de implantação e as instruções abaixo, de modo que sua execução não dependa de acessar outro repositório nem uma instância Web mantida pelos autores. O material externo ainda pode ser necessário na primeira execução para obter imagens Docker, bibliotecas ou os recursos do detector de rostos.

## Disponibilidade, identificação e citação

A referência canônica do artefato será **o registro da versão específica no Zenodo**, não o endereço de uma implantação Web e não o DOI conceitual que aponta para a versão mais recente.

- **Plataforma de preservação:** Zenodo.
- **DOI da versão v0.3.0:** 10.5281/zenodo.22998022.
- **Versão do software documentada:** `0.3.0` (instantâneo vinculado ao WFA 2026).
- **Tipo de recurso no depósito:** `Software`; acesso público após publicação.
- **Licença:** MIT; consultar [`LICENSE`](LICENSE).
- **Metadados de citação:** [`CITATION.cff`](CITATION.cff) — conferir todos os autores e incluir o DOI após sua reserva.
- **Código de referência:** o conteúdo completo **deste próprio arquivo ZIP arquivado**. Desenvolvimento posterior não substitui o instantâneo citado.
- **Artigo associado:** `AcessoMap_Video_WFA2026.pdf`, após inclusão da versão camera-ready com autoria e DOI confirmados.

**Antes de publicar:** reservar o DOI da versão no rascunho do Zenodo, substituí-lo neste README, em `CITATION.cff` e no artigo, verificar autores, concluir a compilação, incluir o PDF no mesmo instantâneo de código e registrar a revisão/commit e o SHA-256 do pacote. O DOI somente se torna registrado quando o depósito é publicado.

## Estrutura mínima esperada do pacote preservado

```text
AcessoMap_Video_v0.3.0_WFA2026/
├── README.md
├── LICENSE
├── CITATION.cff
├── AcessoMap_Video_WFA2026.pdf
├── docker-compose.yml
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
└── docs/
```

A estrutura acima é um **critério para montar o depósito**, e não uma declaração de que um ZIP apenas documental já contenha todos esses arquivos. Dados pessoais, vídeos de participantes, tokens, segredos e bancos de produção não devem integrar o arquivo; para demonstração, utilizar gravações sintéticas ou autorizadas, sem identificadores sensíveis.

## Reprodutibilidade e escopo da validação

Os passos a seguir destinam-se a reproduzir a **validação funcional** do protótipo. A avaliação quantitativa de robustez da detecção/rastreamento, efetividade da sanitização, custo computacional e usabilidade **não foi reportada no artigo**, e portanto não deve ser inferida da conclusão bem-sucedida deste roteiro.

Requisitos de referência: Linux ou outro sistema compatível com Docker; Docker Engine e Docker Compose v2; navegador atualizado com suporte a `Canvas`, `MediaRecorder`, geolocalização e WebM. A primeira execução pode requerer conexão externa para obtenção das imagens de contêineres, dependências de frontend e recursos do MediaPipe. No código v0.3 analisado, o detector utiliza WASM MediaPipe `@mediapipe/tasks-vision@0.10.35` obtido de CDN e o modelo BlazeFace Short Range `float16/1` hospedado externamente; para preservação mais robusta, esses recursos devem ser acompanhados de hash de integridade e, se suas licenças permitirem, cópias incluídas no arquivo. A permissão de localização depende de contexto seguro ou do acesso `localhost` permitido pelo navegador.

```bash
# Na RAIZ do arquivo completo extraído do Zenodo:
docker --version
docker compose version
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:8080/api/health
```

> Neste instantâneo, o `docker-compose.yml` publica o frontend na porta 8080, enquanto Nginx encaminha `/api/` ao serviço FastAPI interno (porta 8000). A interface local é `http://localhost:8080`; nenhum domínio externo de demonstração é necessário.

Ao concluir os testes, finalize a aplicação com `docker compose down`. Os dados de teste persistidos devem ser mantidos separados do pacote de código distribuído.

## Princípio de privacidade

No fluxo usual de publicação, o navegador gera uma cópia visualmente sanitizada (sem trilha de áudio) e quantiza as coordenadas antes do envio. O vídeo bruto permanece localmente; o backend valida declarações do cliente, mas não realiza auditoria independente da remoção de identificadores. Mesmo após a revisão, permanecem riscos de identificação por contexto visual, descrições e localização aproximada.

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
- Gerar uma cópia WebM visualmente sanitizada, sem áudio, no navegador
- Revisar a cópia sanitizada integralmente antes de publicar
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

Durante a sanitização, o AcessoMap calcula a caixa aplicável ao instante corrente. Para rostos, a amostragem temporal é de 500 ms e a associação é heurística: IoU >= 0,08 ou distância normalizada entre centros <= 0,18; esses limiares não foram otimizados experimentalmente. Quando o instante está entre dois keyframes, as coordenadas e dimensões são interpoladas linearmente. Fora do intervalo ativo do track, nenhuma máscara é aplicada.

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

Essas métricas podem ser exportadas em CSV e apoiam avaliações posteriores do fluxo *privacy-aware* e *human-in-the-loop*. Não devem ser interpretadas, isoladamente, como medida de cobertura da sanitização ou comprovação de ausência de dados pessoais.

## Executar com Docker

```bash
docker compose up --build
```

Interface após inicialização: `http://localhost:8080` (acesso local, não um serviço externo).

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

## Citação, evolução e licença

Na pesquisa e no reuso, citar **o DOI específico da versão `0.3.0`** do pacote e o artigo WFA 2026. Para mudanças significativas, produzir nova versão no Zenodo e preservar a referência desta edição; não substituir silenciosamente os arquivos correspondentes a um DOI já citado. Verificar [`CITATION.cff`](CITATION.cff).

O código é distribuído sob **MIT License**; consultar [`LICENSE`](LICENSE). Componentes e recursos de terceiros mantêm suas próprias licenças. A licença MIT do código não concede automaticamente permissão para redistribuir vídeos de participantes, mapas de terceiros ou modelos e dependências externos.