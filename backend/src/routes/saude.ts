import { Router } from 'express';

/** Verificação simples de que a API está no ar. */
export const rotasSaude = Router();

rotasSaude.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});
