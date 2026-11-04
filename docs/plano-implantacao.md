# Plano de implantação

Plano para colocar o Gestão de Veículos em uso na Secretaria Municipal de Educação de Barão de Cocais (issue #24). A parte técnica do servidor (Docker, Nginx, HTTPS e backup) está na issue #23; o teste com os servidores da secretaria, na #25.

> **Rascunho.** Os itens marcados com **[A COMBINAR]** ainda precisam ser decididos pela equipe ou confirmados com a prefeitura.

## 1. Visão geral

| Item | Definição |
| --- | --- |
| Onde roda | VPS com 1 vCPU, 1–2 GB de RAM e 20–40 GB de SSD, com Docker Compose (PostgreSQL 16, backend Node e Nginx) |
| Endereço | Subdomínio da prefeitura, com HTTPS (Let's Encrypt) **[A COMBINAR: nome do subdomínio]** |
| Quem usa | Servidores da secretaria (reservam veículos) e um ou dois administradores (usuários, veículos e feriados) |
| Estratégia | Implantação única, sem rodar em paralelo com outro sistema. Durante as duas primeiras semanas, o controle atual (planilha ou caderno) fica guardado como plano B. |
| Janela | Sistema no ar antes do teste de usabilidade (24/11–30/11). Ajustes do teste entram até **[A COMBINAR]**. |

## 2. Passos de implantação

### Fase 1 — Preparação (até 14/11)

| # | Passo | Responsável | Pronto quando |
| --- | --- | --- | --- |
| 1.1 | Contratar ou receber a VPS | Davi + TI da prefeitura | Acesso SSH funcionando |
| 1.2 | Pedir o subdomínio e apontar o DNS para a VPS | TI da prefeitura | `nslookup <subdomínio>` devolve o IP da VPS |
| 1.3 | Definir quem será o administrador na secretaria | João + secretaria | Nome, e-mail e CPF do administrador |
| 1.4 | Levantar a lista de veículos (modelo e placa) | João + secretaria | Planilha conferida pela secretaria |
| 1.5 | Levantar a lista de servidores que vão reservar (nome, e-mail, CPF) | João + secretaria | Planilha conferida pela secretaria |
| 1.6 | Ter tudo mesclado na `main` com CI verde | João + Davi | Merge `dev` → `main` feito |

### Fase 2 — Instalação no servidor (até 19/11)

| # | Passo | Responsável | Pronto quando |
| --- | --- | --- | --- |
| 2.1 | Instalar Docker e subir o Compose de produção (banco, backend e Nginx) | Davi | Containers `healthy` |
| 2.2 | Emitir o certificado Let's Encrypt e configurar a renovação automática | Davi | Site abre com cadeado, sem aviso |
| 2.3 | Configurar o `.env` de produção: `NODE_ENV=production`, senha forte do banco e `SEED_ADMIN_SENHA` | Davi | `.env` fora do Git, com senhas guardadas pela equipe **[A COMBINAR: onde guardar]** |
| 2.4 | Aplicar as migrações (`npm run db:deploy -w backend`) e rodar o seed | Davi | `/api/v1/saude` responde `{"status":"ok"}` |
| 2.5 | Configurar o backup diário do banco para fora da VPS | Davi | Primeiro backup existe no destino externo |
| 2.6 | **Testar a restauração do backup** num banco separado | Davi | Restauração feita e dados conferidos |
| 2.7 | Desativar os veículos de exemplo do seed e importar os feriados do ano (BrasilAPI) e os municipais | João | Lista de veículos e feriados correta |

### Fase 3 — Carga inicial e conferência (até 21/11)

| # | Passo | Responsável | Pronto quando |
| --- | --- | --- | --- |
| 3.1 | Entrar como administrador e trocar a senha inicial | João + administrador da secretaria | Senha do seed não funciona mais |
| 3.2 | Cadastrar os veículos reais | João | Lista bate com a planilha 1.4 |
| 3.3 | Cadastrar os servidores e entregar as senhas provisórias de forma individual (nunca em grupo) | João + administrador | Cada servidor recebeu a sua |
| 3.4 | Teste de fumaça em produção: login, reserva, conflito de turno, cancelamento, agenda, histórico, no computador e no celular | João + Davi | Roteiro sem erro; reservas de teste canceladas |

### Fase 4 — Entrada em uso (a partir de 24/11)

| # | Passo | Responsável | Pronto quando |
| --- | --- | --- | --- |
| 4.1 | Apresentação curta (15–20 min) para os servidores: login, troca de senha, nova reserva e cancelamento | João | Apresentação feita |
| 4.2 | Teste de usabilidade (issue #25) | João + Davi | Relatório da #25 |
| 4.3 | Acompanhamento nas duas primeiras semanas: canal para dúvidas e problemas **[A COMBINAR: WhatsApp ou e-mail]** | João + Davi | Dúvidas respondidas em até 1 dia útil |
| 4.4 | Aplicar os ajustes do teste e publicar uma nova versão | João + Davi | Nova versão no ar, registrada na seção 5 |
| 4.5 | Entregar o sistema à secretaria: senhas, contatos, como pedir suporte | João + Davi | Termo de entrega assinado **[A COMBINAR: se precisa]** |

**Atenção à regra de antecedência.** A reserva só pode ser feita de 5 a 7 dias antes (D+5 a D+7). Quem entrar no sistema no primeiro dia só consegue reservar para 5 dias depois. As viagens dos primeiros dias precisam ser combinadas pelo controle atual, ou cadastradas pelo administrador com antecedência, e isso tem que ser avisado na apresentação (4.1).

### Para cada nova versão depois da implantação

1. Fazer o backup manual do banco antes de qualquer migração.
2. Fazer o merge na `main` com o CI verde.
3. Na VPS, atualizar o código, `docker compose build` e `docker compose up -d`. As migrações (`db:deploy`) precisam rodar antes do backend novo subir **[A COMBINAR com a #23: automático no container ou à mão]**.
4. Conferir `/api/v1/saude` e repetir o teste de fumaça (3.4) de forma resumida.
5. Anotar a versão na seção 5.

## 3. Responsáveis

### Equipe

| Pessoa | Papel |
| --- | --- |
| **Davi** | Infraestrutura: VPS, Docker, Nginx, HTTPS, backup, atualizações e monitoramento |
| **João** | Dados e pessoas: carga inicial, administradores, apresentação aos servidores, teste de usabilidade e suporte de primeiro nível |
| **Os dois** | Conferência em produção (3.4), correções e decisão de recuar uma versão |

### Prefeitura **[A COMBINAR: nomes]**

| Papel | Responsabilidade |
| --- | --- |
| Responsável na Secretaria de Educação | Aprova a entrada em uso, indica os servidores e o administrador |
| Administrador do sistema na secretaria | Cadastra e desativa usuários e veículos, redefine senhas e cadastra feriados municipais |
| TI da prefeitura | Subdomínio e DNS e, se for o caso, a VPS |
| Servidores da secretaria | Usam o sistema e participam do teste de usabilidade |

## 4. Riscos e plano de contingência

| Risco | Chance | Impacto | Prevenção | Se acontecer |
| --- | --- | --- | --- | --- |
| VPS ou subdomínio não ficam prontos a tempo | Média | Alto | Pedir na primeira semana (1.1 e 1.2) | Usar temporariamente um subdomínio gratuito com HTTPS (ex.: DuckDNS) e trocar depois |
| Sistema fora do ar | Baixa | Alto | `restart: unless-stopped` nos containers e verificação periódica de `/api/v1/saude` **[A COMBINAR: ferramenta]** | Reservas no controle antigo e lançamento no sistema quando ele voltar |
| Perda ou corrupção do banco | Baixa | Alto | Backup diário fora da VPS e restauração testada (2.6) | Restaurar o último backup. No máximo um dia de reservas é perdido; conferir com os servidores. |
| Nova versão com erro | Média | Médio | CI verde, backup antes da migração e teste de fumaça | Voltar para a versão anterior. Se a migração estragou dados, restaurar o backup feito no passo 1. |
| Senha inicial do administrador vazar ou não ser trocada | Baixa | Alto | Senha forte no `.env` e troca da senha logo no primeiro acesso (3.1) | Redefinir a senha e conferir o histórico (auditoria) |
| Certificado HTTPS expira | Baixa | Alto: sem HTTPS, ninguém consegue entrar | Renovação automática do Let's Encrypt | Renovar à mão (`certbot renew`) e reiniciar o Nginx |
| Servidor esquece a senha | Alta | Baixo | Avisar na apresentação quem é o administrador | Administrador redefine a senha e gera uma provisória |
| BrasilAPI fora do ar ao importar feriados | Baixa | Baixo | Importar com antecedência | Cadastrar os feriados à mão |
| VPS lenta (1 vCPU): login com Argon2 pesado quando muitos entram juntos | Média | Médio | Acompanhar o uso na primeira semana | Aumentar o plano da VPS ou ajustar os parâmetros do Argon2 |
| Servidores não aderem e continuam no controle antigo | Média | Alto | Apresentação, teste de usabilidade e responsável da secretaria cobrando o uso | Ouvir os motivos e ajustar o sistema (4.4) |
| Disputa de veículo: dois querem o mesmo carro e turno | Alta | Baixo | O sistema bloqueia o conflito e mostra a agenda | A secretaria define a regra de prioridade **[A COMBINAR]** |
| Dados pessoais (CPF, e-mail) expostos | Baixa | Alto | HTTPS, banco sem porta pública, senhas com Argon2, CPF mascarado na tela, acesso de admin restrito | Avisar a prefeitura, trocar as senhas e verificar a auditoria (LGPD) |

## 5. Registro da implantação

Preencher a cada etapa concluída e a cada versão publicada.

| Data | Versão (commit ou tag) | O que foi feito | Quem fez | Problemas e observações |
| --- | --- | --- | --- | --- |
| | | | | |

### Checklist de entrada em uso

- [ ] Site abre no subdomínio com HTTPS
- [ ] `/api/v1/saude` responde ok
- [ ] Backup diário funcionando e restauração testada
- [ ] Senha inicial do administrador trocada
- [ ] Veículos de exemplo desativados e veículos reais cadastrados
- [ ] Feriados do ano cadastrados (nacionais e municipais)
- [ ] Servidores cadastrados e com senha provisória entregue
- [ ] Teste de fumaça feito no computador e no celular
- [ ] Apresentação feita aos servidores
- [ ] Responsáveis da prefeitura com os contatos da equipe
