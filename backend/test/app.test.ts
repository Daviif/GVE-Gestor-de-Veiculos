import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';

const app = criarApp();

describe('API', () => {
  it('responde à verificação de saúde', async () => {
    const resposta = await request(app).get('/api/v1/saude');
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ status: 'ok' });
  });

  it('devolve 404 no formato padrão de erro', async () => {
    const resposta = await request(app).get('/api/v1/nao-existe');
    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({
      erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Rota não encontrada.' },
    });
  });

  it('recusa JSON malformado com 400', async () => {
    const resposta = await request(app)
      .post('/api/v1/saude')
      .set('Content-Type', 'application/json')
      .send('{ quebrado');
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('JSON_INVALIDO');
  });
});
