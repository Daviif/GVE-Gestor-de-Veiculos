import express from 'express';
import { rotaNaoEncontrada, tratarErros } from './middleware/erros';
import { rotasSaude } from './routes/saude';

export function criarApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/api/v1/saude', rotasSaude);

  app.use('/api', rotaNaoEncontrada);
  app.use(tratarErros);

  return app;
}
