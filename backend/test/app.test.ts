import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('mensagens de validação', () => {
  it('as genéricas do Zod também saem em português', async () => {
    const resposta = await request(app).post('/api/v1/auth/login').send([1, 2]);
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.mensagem).toMatch(/^Entrada inválida: esperava um objeto/);
  });

  it('erro de validação aponta o campo; erro que não é de campo não aponta', async () => {
    const vazio = await request(app).post('/api/v1/auth/login').send({ login: '', senha: 'x' });
    expect(vazio.body.erro).toEqual({
      codigo: 'ENTRADA_INVALIDA',
      mensagem: 'Informe o e-mail ou o CPF.',
      campo: 'login',
    });

    const naoEncontrada = await request(app).get('/api/v1/nao-existe');
    expect(naoEncontrada.body.erro).not.toHaveProperty('campo');
  });
});

describe('corpo que não dá para ler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['grande demais', 'application/json', {}, 413, 'CORPO_GRANDE_DEMAIS'],
    [
      'com charset que não é UTF-8',
      'application/json; charset=latin9',
      {},
      415,
      'FORMATO_NAO_SUPORTADO',
    ],
    [
      'com compressão desconhecida',
      'application/json',
      { 'Content-Encoding': 'xpto' },
      415,
      'FORMATO_NAO_SUPORTADO',
    ],
    [
      'com compressão corrompida',
      'application/json',
      { 'Content-Encoding': 'br' },
      400,
      'REQUISICAO_INVALIDA',
    ],
  ])(
    '%s: responde 4xx em português, sem registrar erro no servidor',
    async (caso, tipo, cabecalhos, status, codigo) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const corpo = caso === 'grande demais' ? JSON.stringify({ x: 'a'.repeat(200_000) }) : '{}';

      const resposta = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', tipo)
        .set(cabecalhos)
        .send(corpo);
      expect(resposta.status).toBe(status);
      expect(resposta.body.erro.codigo).toBe(codigo);
      expect(log).not.toHaveBeenCalled();
    },
  );
});
