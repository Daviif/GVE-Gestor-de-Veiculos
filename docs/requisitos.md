# Requisitos do GVE

Cópia de trabalho dos requisitos para quem lê o código. O documento oficial é o da Etapa 2
(_Levantamento de Requisitos — Gestão Veicular da Educação_, PDF fora do repositório), validado com
a Secretaria. Os códigos RF/RN/RNF citados nos comentários do código são os deste arquivo.

Regra da equipe: **toda regra que o código impõe está escrita aqui antes do código e tem teste
próprio.** O que não veio da Etapa 2 fica na seção [Regras complementares](#regras-complementares-rc)
(RC), decididas pela equipe.

## Requisitos funcionais (RF)

| ID   | Requisito                                                                                          | Perfil |
| ---- | -------------------------------------------------------------------------------------------------- | ------ |
| RF01 | Autenticar usuários cadastrados por login (e-mail ou CPF) e senha.                                 | Todos  |
| RF02 | Encerrar a sessão (logout).                                                                        | Todos  |
| RF03 | Cadastrar, editar e desativar usuários (nome, e-mail, CPF, perfil, situação), e-mail e CPF únicos. | Admin  |
| RF04 | Redefinir a senha de qualquer usuário; não há recuperação de senha pelo próprio usuário.           | Admin  |
| RF05 | Cadastrar, editar e desativar veículos, identificados por placa e modelo.                          | Admin  |
| RF06 | Criar reserva informando data, turno, veículo e destino.                                           | Todos  |
| RF07 | Impedir a reserva de um veículo já reservado na mesma data e turno (RN01).                         | Todos  |
| RF08 | Ao escolher data e turno, listar só os veículos disponíveis e indicar os ocupados.                 | Todos  |
| RF09 | Aceitar só datas dentro da janela de antecedência (RN02).                                          | Todos  |
| RF10 | O servidor cancela as próprias reservas futuras.                                                   | Todos  |
| RF11 | O administrador cancela qualquer reserva futura.                                                   | Admin  |
| RF12 | Consultar a lista das próprias reservas (futuras e passadas).                                      | Todos  |
| RF13 | Agenda da frota: ocupação de cada veículo por data e turno, com quem reservou e o destino.         | Todos  |
| RF14 | Alterar a própria senha após o login.                                                              | Todos  |
| RF15 | Registrar o histórico de reservas e cancelamentos (quem, quando, por quem foi cancelado).          | Admin  |
| RF16 | Filtrar o histórico por período, veículo ou servidor.                                              | Admin  |
| RF17 | Cadastrar os feriados (nacionais, estaduais e municipais), nos quais as reservas são bloqueadas.   | Admin  |

## Regras de negócio (RN)

| ID   | Regra                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| RN01 | Cada veículo + data + turno admite no máximo uma reserva ativa; só é liberada quando o autor (ou o administrador) cancela.             |
| RN02 | A data reservada fica entre 5 e 7 dias após o dia em que a reserva é feita. Ex.: feita em 13/10, aceita 18/10 a 20/10.                |
| RN03 | Não há limite de reservas por servidor.                                                                                               |
| RN04 | Turnos: matutino e vespertino. Dia inteiro exige duas reservas.                                                                       |
| RN05 | O servidor cancela só as próprias reservas; o administrador cancela qualquer uma. Só reservas futuras podem ser canceladas.           |
| RN06 | O destino é obrigatório.                                                                                                              |
| RN07 | O motorista é o próprio servidor que reservou; não há cadastro de motoristas.                                                         |
| RN08 | Só usuários cadastrados pelo administrador acessam; não há autocadastro nem recuperação de senha por e-mail.                          |
| RN09 | A placa é única por veículo. O cadastro não fixa o tamanho da frota.                                                                  |
| RN10 | Usuários e veículos são desativados, não excluídos. Ao desativar um veículo, as reservas futuras dele são canceladas e o admin avisado. |
| RN11 | Reservas em todos os dias da semana, exceto feriados cadastrados. Feriado cadastrado numa data com reservas gera aviso ao admin.        |

## Requisitos não funcionais (RNF)

| ID    | Requisito                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------- |
| RNF01 | Aplicação web nas versões atuais de Chrome, Edge e Firefox (desktop) e Chrome/Safari (celular).    |
| RNF02 | Utilizável a partir de 360 px de largura, sem rolagem horizontal.                                  |
| RNF03 | Reserva concluída em até 4 telas/passos, sem treinamento.                                          |
| RNF04 | Logo do município no cabeçalho e na tela de login.                                                 |
| RNF05 | Interface em português (Brasil), datas dd/mm/aaaa, fuso America/Sao_Paulo.                        |
| RNF06 | Senhas com hash forte (bcrypt ou Argon2), nunca em texto puro.                                     |
| RNF07 | Acesso só por HTTPS com certificado válido.                                                        |
| RNF08 | Telas e rotas de administração só para o perfil Administrador.                                     |
| RNF09 | O bloqueio de conflito (RN01) é garantido no banco, não só na interface.                           |
| RNF10 | Respostas em até 2 s com 30 usuários simultâneos.                                                  |
| RNF11 | A sessão expira após 30 min de inatividade.                                                        |
| RNF12 | Disponível em horário comercial; backup diário do banco mantido por 30 dias.                       |
| RNF13 | LGPD: só nome, e-mail, CPF e perfil; CPF visível só ao admin; destino e histórico só a autenticados. |
| RNF14 | Código em repositório com instruções de instalação e implantação reproduzíveis.                    |
| RNF15 | Contraste e rótulos seguindo WCAG 2.1 AA nos pontos básicos.                                       |

## Regras complementares (RC)

Detalhes que a Etapa 2 não fixou e a equipe decidiu. Mudou uma delas? Mude aqui primeiro.

| ID   | Regra                                                                                                                                                                                                 | Onde no código                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| RC01 | Horário dos turnos (Brasília): matutino 7h–12h, vespertino 13h–17h.                                                                                                                                   | `shared/src/reservas.ts` (`HORARIO_TURNO`)          |
| RC02 | Uma reserva é **futura** até o turno começar; depois disso é **passada** (inclusive a de hoje). Vale para cancelar (RN05), para "Próximas/Anteriores" em Minhas reservas e para a situação no histórico. | `shared/src/reservas.ts` (`turnoJaComecou`, `situacaoDaReserva`) |
| RC03 | Limites de texto: destino e motivo de cancelamento até 200 caracteres; nome até 120; e-mail até 254; modelo até 80; nome do feriado até 120; senha de 8 a 128.                                        | `shared/src/*.ts`                                   |
| RC04 | O administrador que cancela a reserva de outra pessoa informa o motivo; o próprio autor cancela sem motivo.                                                                                          | `shared/src/reservas.ts` (`cancelamentoSchema`)     |
| RC05 | A agenda mostra no máximo 31 dias por consulta.                                                                                                                                                       | `AGENDA_JANELA_MAX_DIAS`                            |
| RC06 | Login bloqueado por 15 min após 5 senhas erradas na mesma conta. Errar a senha atual ao trocar a senha (RF14) conta como uma dessas falhas; ao chegar ao bloqueio, todas as sessões da conta caem. Troca aceita: quem conhece o e-mail de alguém consegue travar o login dessa pessoa por 15 min; o limite por IP (RC07) reduz o abuso. | `backend/src/routes/auth.ts` |
| RC07 | No máximo 20 logins errados por minuto vindos do mesmo IP (somando todas as contas); logins certos não contam.                                                                                       | `backend/src/routes/auth.ts`                        |
| RC08 | Senha provisória (cadastro e redefinição, RF04) com 10 caracteres sem os ambíguos 0/O e 1/l/I; troca obrigatória no primeiro acesso.                                                                | `backend/src/routes/usuarios.ts`                    |
| RC09 | O administrador não altera o próprio perfil nem desativa o próprio acesso, e o sistema sempre mantém pelo menos um administrador ativo.                                                                | `backend/src/routes/usuarios.ts`                    |
| RC10 | Cancelar uma reserva já cancelada é recusado, mesmo com dois pedidos ao mesmo tempo; ativar/desativar quem já está na situação pedida não muda nada. Nenhum dos dois gera registro novo no histórico. | `backend/src/routes/reservas.ts`, `usuarios.ts`     |
| RC11 | Tentativa de login com conta inexistente vai para a auditoria com o texto digitado só se for um e-mail ou CPF bem formado; qualquer outro texto (pode ser a senha no campo errado) é gravado como hash SHA-256. | `backend/src/routes/auth.ts` |
