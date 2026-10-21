import express from 'express';
import { config } from './config';
import { rotaNaoEncontrada, tratarErros } from './middleware/erros';
import { rotasAgenda } from './routes/agenda';
import { rotasAuth } from './routes/auth';
import { rotasFeriados } from './routes/feriados';
import { rotasReservas } from './routes/reservas';
import { rotasSaude } from './routes/saude';
import { rotasUsuarios } from './routes/usuarios';

export function criarApp() {
  const app = express();

  app.disable('x-powered-by');
  // Em produção a API fica atrás do Nginx: o IP do cliente (auditoria) vem do X-Forwarded-For.
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(express.json());

  app.use('/api/v1/saude', rotasSaude);
  app.use('/api/v1/auth', rotasAuth);
  app.use('/api/v1/reservas', rotasReservas);
  app.use('/api/v1/agenda', rotasAgenda);
  app.use('/api/v1/usuarios', rotasUsuarios);
  app.use('/api/v1/feriados', rotasFeriados);

  app.use('/api', rotaNaoEncontrada);
  app.use(tratarErros);

  return app;
}
