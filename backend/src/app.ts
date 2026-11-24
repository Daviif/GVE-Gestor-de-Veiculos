import express from 'express';
import { config } from './config';
import { rotaNaoEncontrada, tratarErros } from './middleware/erros';
import { rotasAgenda } from './routes/agenda';
import { rotasAuth } from './routes/auth';
import { rotasFeriados } from './routes/feriados';
import { rotasHistorico } from './routes/historico';
import { rotasReservas } from './routes/reservas';
import { rotasSaude } from './routes/saude';
import { rotasUsuarios } from './routes/usuarios';
import { rotasVeiculos } from './routes/veiculos';

export function criarApp() {
  const app = express();

  app.disable('x-powered-by');
  // Em produção a API fica atrás do Nginx: o IP do cliente (auditoria) vem do X-Forwarded-For.
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1);
  // Nenhum cliente manda corpo comprimido; recusar (415) fecha a porta para falhas de
  // descompressão do body-parser, como a GHSA-27r3-jxmh-p828.
  app.use(express.json({ inflate: false }));

  app.use('/api/v1/saude', rotasSaude);
  app.use('/api/v1/auth', rotasAuth);
  app.use('/api/v1/reservas', rotasReservas);
  app.use('/api/v1/agenda', rotasAgenda);
  app.use('/api/v1/usuarios', rotasUsuarios);
  app.use('/api/v1/feriados', rotasFeriados);
  app.use('/api/v1/historico', rotasHistorico);
  app.use('/api/v1/veiculos', rotasVeiculos);

  app.use('/api', rotaNaoEncontrada);
  app.use(tratarErros);

  return app;
}
